# Local worker image (the Modal deployment builds its own image from modal_app.py).
FROM python:3.11-slim-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

# Subtitle fonts (SIL Open Font License) and MediaPipe face model.
RUN mkdir -p /assets/fonts /assets/models \
 && for f in Poppins-ExtraBold.ttf Poppins-Bold.ttf Poppins-SemiBold.ttf OFL.txt; do \
      curl -fsSL -o /assets/fonts/$f https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/$f; done \
 && curl -fsSL -o /assets/models/blaze_face_short_range.tflite \
      https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite

WORKDIR /app
COPY pyproject.toml ./
COPY clipper ./clipper
RUN pip install --no-cache-dir ".[local]"
COPY local_server.py ./

ENV CLIPPER_ASSETS_DIR=/assets WHISPER_CACHE_DIR=/models/whisper PYTHONUNBUFFERED=1
EXPOSE 8787
CMD ["uvicorn", "local_server:app", "--host", "0.0.0.0", "--port", "8787"]
