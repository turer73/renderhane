FROM python:3.11.15-slim-bookworm@sha256:d29f48a31a8b408ed19272ca1e7b10ebae13b240a27e862d3d4217c528e2e0c3

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 RELIEF_WORKSHOP_DATA=/data
WORKDIR /app
COPY workers/relief/requirements-workshop.lock.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
    && groupadd --gid 10001 relief \
    && useradd --uid 10001 --gid relief --no-create-home relief \
    && mkdir /data && chown relief:relief /data
COPY workers/relief /app/workers/relief
COPY benchmarks/relief/fdm-physical-measurement-template-v2.csv /app/benchmarks/relief/
COPY benchmarks/relief/uv-physical-measurement-template-v2.csv /app/benchmarks/relief/
USER relief
WORKDIR /app/workers/relief
EXPOSE 8421
CMD ["gunicorn", "workshop_http:create_app()", "--bind", "0.0.0.0:8421", "--workers", "1", "--threads", "2", "--timeout", "60", "--access-logfile", "-"]
