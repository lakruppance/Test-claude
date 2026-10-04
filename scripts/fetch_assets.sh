#!/usr/bin/env bash
# Downloads the subtitle fonts (OFL) and the MediaPipe face model used by local tests.
set -euo pipefail
cd "$(dirname "$0")/../workers"
mkdir -p .fonts .models
for f in Poppins-ExtraBold.ttf Poppins-Bold.ttf Poppins-SemiBold.ttf OFL.txt; do
  [ -f ".fonts/$f" ] || curl -fsSL -o ".fonts/$f" "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/$f"
done
M=.models/blaze_face_short_range.tflite
[ -f "$M" ] || curl -fsSL -o "$M" https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite
