"""
Renderhane Blender Plugin — AI-powered 3D model generation.

Generate 3D models from images directly in Blender using Renderhane API.
Supports: Background removal, 3D model generation, image enhancement.

Installation:
  1. Edit > Preferences > Add-ons > Install...
  2. Select this folder as a ZIP or point to this __init__.py
  3. Enable "Renderhane AI Tools"
  4. Set your API key in the addon preferences

Usage:
  - 3D Viewport > Sidebar (N) > Renderhane tab
  - Select an image, choose tool, click Generate
"""

bl_info = {
    "name": "Renderhane AI Tools",
    "author": "Renderhane",
    "version": (1, 0, 0),
    "blender": (3, 6, 0),
    "location": "View3D > Sidebar > Renderhane",
    "description": "Generate 3D models from images using Renderhane AI API",
    "category": "Import-Export",
    "doc_url": "https://www.renderhane.com/docs/blender",
    "tracker_url": "https://github.com/turer73/renderhane/issues",
}

import bpy
import os
import json
import tempfile
import threading
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError
import base64

API_BASE = "https://www.renderhane.com/api/v1"


# ── Preferences ──────────────────────────────────────────

class RenderhanePreferences(bpy.types.AddonPreferences):
    bl_idname = __name__

    api_key: bpy.props.StringProperty(
        name="API Key",
        description="Your Renderhane API key (starts with rh_)",
        subtype='PASSWORD',
        default="",
    )

    def draw(self, layout):
        layout.prop(self, "api_key")
        layout.label(text="Get your API key at: renderhane.com/app/settings")


# ── API Client ───────────────────────────────────────────

def api_request(endpoint, method="GET", data=None, api_key=""):
    """Make an authenticated request to Renderhane API."""
    url = f"{API_BASE}{endpoint}"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    if data:
        body = json.dumps(data).encode("utf-8")
    else:
        body = None

    req = urllib_request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib_request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        raise Exception(f"API error {e.code}: {error_body}")
    except URLError as e:
        raise Exception(f"Connection error: {e.reason}")


def image_to_data_url(filepath):
    """Convert an image file to a base64 data URL."""
    ext = os.path.splitext(filepath)[1].lower()
    mime_map = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}
    mime = mime_map.get(ext, "image/png")

    with open(filepath, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("utf-8")

    return f"data:{mime};base64,{encoded}"


def download_file(url, dest_path):
    """Download a file from URL to local path."""
    req = urllib_request.Request(url)
    with urllib_request.urlopen(req, timeout=300) as resp:
        with open(dest_path, "wb") as f:
            f.write(resp.read())


# ── Operators ────────────────────────────────────────────

class RENDERHANE_OT_check_balance(bpy.types.Operator):
    """Check your Renderhane credit balance"""
    bl_idname = "renderhane.check_balance"
    bl_label = "Check Balance"

    def execute(self, context):
        prefs = bpy.context.preferences.addons[__name__].preferences
        if not prefs.api_key:
            self.report({'ERROR'}, "Set your API key in addon preferences")
            return {'CANCELLED'}

        try:
            result = api_request("/balance", api_key=prefs.api_key)
            context.scene.renderhane_balance = result.get("balance", 0)
            self.report({'INFO'}, f"Balance: {result['balance']} credits")
        except Exception as e:
            self.report({'ERROR'}, str(e))

        return {'FINISHED'}


class RENDERHANE_OT_generate_3d(bpy.types.Operator):
    """Generate a 3D model from an image using Renderhane AI"""
    bl_idname = "renderhane.generate_3d"
    bl_label = "Generate 3D Model"

    _timer = None
    _thread = None
    _job_id = None
    _error = None
    _result_url = None

    def modal(self, context, event):
        if event.type == 'TIMER':
            # Check if background thread finished
            if self._thread and not self._thread.is_alive():
                context.window_manager.event_timer_remove(self._timer)

                if self._error:
                    self.report({'ERROR'}, self._error)
                    return {'CANCELLED'}

                if self._result_url:
                    # Download and import the 3D model
                    try:
                        tmp = tempfile.mktemp(suffix=".glb")
                        download_file(self._result_url, tmp)

                        bpy.ops.import_scene.gltf(filepath=tmp)
                        self.report({'INFO'}, "3D model imported successfully!")

                        # Cleanup temp file
                        try:
                            os.remove(tmp)
                        except OSError:
                            pass

                    except Exception as e:
                        self.report({'ERROR'}, f"Import failed: {e}")
                        return {'CANCELLED'}

                return {'FINISHED'}

        return {'PASS_THROUGH'}

    def execute(self, context):
        prefs = bpy.context.preferences.addons[__name__].preferences
        if not prefs.api_key:
            self.report({'ERROR'}, "Set your API key in addon preferences")
            return {'CANCELLED'}

        image_path = context.scene.renderhane_image_path
        if not image_path or not os.path.isfile(image_path):
            self.report({'ERROR'}, "Select a valid image file")
            return {'CANCELLED'}

        tier = context.scene.renderhane_tier

        # Start background thread
        self._thread = threading.Thread(
            target=self._submit_and_poll,
            args=(prefs.api_key, image_path, tier),
        )
        self._thread.daemon = True
        self._thread.start()

        # Set up timer to check thread
        self._timer = context.window_manager.event_timer_add(1.0, window=context.window)
        context.window_manager.modal_handler_add(self)

        self.report({'INFO'}, "Submitting to Renderhane AI... Please wait.")
        return {'RUNNING_MODAL'}

    def _submit_and_poll(self, api_key, image_path, tier):
        """Background: submit job, poll status, get result URL."""
        import time

        try:
            # Upload image as data URL
            data_url = image_to_data_url(image_path)

            # Submit job
            result = api_request("/jobs", method="POST", data={
                "tool": "3d-model",
                "tier": tier,
                "imageUrl": data_url,
            }, api_key=api_key)

            job_id = result.get("jobId")
            if not job_id:
                self._error = "Failed to submit job"
                return

            self._job_id = job_id

            # Poll for completion (max 5 minutes)
            for _ in range(60):
                time.sleep(5)
                status = api_request(f"/jobs/{job_id}", api_key=api_key)

                if status["status"] == "completed":
                    output = status.get("output", {})
                    self._result_url = output.get("url")
                    if not self._result_url:
                        self._error = "Job completed but no output URL"
                    return

                if status["status"] == "failed":
                    self._error = status.get("error", "Job failed")
                    return

            self._error = "Job timed out after 5 minutes"

        except Exception as e:
            self._error = str(e)


# ── UI Panel ─────────────────────────────────────────────

class RENDERHANE_PT_main_panel(bpy.types.Panel):
    bl_label = "Renderhane AI"
    bl_idname = "RENDERHANE_PT_main_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Renderhane"

    def draw(self, context):
        layout = self.layout
        scene = context.scene

        # Balance
        row = layout.row(align=True)
        row.label(text=f"Credits: {scene.renderhane_balance}")
        row.operator("renderhane.check_balance", text="", icon='FILE_REFRESH')

        layout.separator()

        # Image selection
        layout.label(text="Source Image:")
        layout.prop(scene, "renderhane_image_path", text="")

        # Tier selection
        layout.label(text="Quality:")
        layout.prop(scene, "renderhane_tier", text="")

        # Generate button
        layout.separator()
        row = layout.row()
        row.scale_y = 1.5
        row.operator("renderhane.generate_3d", icon='MESH_MONKEY')


# ── Registration ─────────────────────────────────────────

classes = (
    RenderhanePreferences,
    RENDERHANE_OT_check_balance,
    RENDERHANE_OT_generate_3d,
    RENDERHANE_PT_main_panel,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)

    bpy.types.Scene.renderhane_image_path = bpy.props.StringProperty(
        name="Image",
        description="Path to the source image",
        subtype='FILE_PATH',
    )
    bpy.types.Scene.renderhane_tier = bpy.props.EnumProperty(
        name="Tier",
        items=[
            ('fast', "Fast (5 cr)", "TRELLIS — Quick preview, ~15s"),
            ('standard', "Standard (15 cr)", "Meshy 5 — Better quality, ~60s"),
            ('premium', "Premium (30 cr)", "Hunyuan3D — Best quality, ~120s"),
        ],
        default='standard',
    )
    bpy.types.Scene.renderhane_balance = bpy.props.IntProperty(
        name="Balance",
        default=0,
    )


def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

    del bpy.types.Scene.renderhane_image_path
    del bpy.types.Scene.renderhane_tier
    del bpy.types.Scene.renderhane_balance


if __name__ == "__main__":
    register()
