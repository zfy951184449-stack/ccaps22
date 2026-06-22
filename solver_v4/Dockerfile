FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD gunicorn --bind 0.0.0.0:${PORT:-5005} --workers 2 --threads 4 --worker-class gthread --timeout 3900 --graceful-timeout 30 app:app
