FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
ENV STORAGE_DIR=/data PYTHONUNBUFFERED=1
RUN useradd -m eyd && mkdir -p /data && chown eyd /data
USER eyd
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
