-- Missing indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_outputs_project ON public.outputs(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_project ON public.jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type_status ON public.credit_transactions(type, status);

-- Add updated_at auto-update trigger for profiles
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to profiles (updated_at was manually set in RPC functions, but
-- this trigger ensures it stays current for direct updates too)
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Apply to projects
DROP TRIGGER IF EXISTS set_projects_updated_at ON public.projects;
CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
