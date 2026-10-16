# Offline PaddleOCR models

Engine: `@paddleocr/paddleocr-js@0.4.2`, Apache-2.0. Official PP-OCRv6 small detection and multilingual recognition ONNX tar archives are pinned in `manifest.json` with source URLs, sizes and SHA-256 hashes. Models are distributed under Apache-2.0; see LICENSE. See https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js .

`node scripts/verify-ocr-assets.mjs` validates local models. `--download` restores missing pinned archives and verifies their hashes. Building never downloads models. ONNX Runtime Web and OpenCV.js are bundled from the exact package-lock dependencies. Inference uses the isolated `nexlet-plugin` protocol with network requests denied.

Bundled runtime dependencies: `onnxruntime-web@1.24.3` (MIT; notices included), `@techstark/opencv-js@4.10.0-release.1` (Apache-2.0), `clipper-lib@6.4.2` (Boost Software License 1.0; copyright Angus Johnson 2010-2017 and Timo 2013-2017), and `js-yaml@4.3.2` (MIT). See the accompanying license files and ONNX Runtime third-party notices.

The prebuilt PaddleOCR worker embeds ONNX Runtime 1.24.3. The plugin therefore pins the matching JSEP runtime and WASM; upgrading it independently is not supported.
