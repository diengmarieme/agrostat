FROM python:3.11-slim

WORKDIR /station

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

ENV PYTHONPATH=/station

CMD ["python", "app/main.py"]
