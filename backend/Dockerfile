FROM python:3.11-slim

# Install system dependencies for netmiko/paramiko + ping
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libffi-dev iputils-ping openssh-client curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

# Copy Angular build (must be built first)
COPY backend/static/ static/

# Create firmware directory
RUN mkdir -p firmware_images logs

# Environment
ENV PYTHONUNBUFFERED=1
ENV MONGO_URI=mongodb://mongo:27017/cisco_upgrade_manager
ENV SIMULATION_MODE=false
ENV JWT_SECRET=change-me-in-production

EXPOSE 5000

# Run with Gunicorn — eventlet worker for SSE support
CMD ["gunicorn", \
     "--bind", "0.0.0.0:5000", \
     "--workers", "4", \
     "--threads", "8", \
     "--timeout", "3600", \
     "--keep-alive", "65", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "app:app"]
