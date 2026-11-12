"""Exercise endpoint routing and output/credential invariants without API calls."""

import base64
import importlib.util
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

import httpx
from openai import OpenAI as RealOpenAI


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "generate_image.py"
SPEC = importlib.util.spec_from_file_location("skill_generate_image", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
FAKE_KEY = "fixture-key-not-a-real-credential"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jUn4AAAAASUVORK5CYII=")


class GenerateImageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.output = self.root / "run"
        self.requests = []

    def invoke(self, args, status=200, error=None, missing_key=False):
        def handler(request):
            self.requests.append(request)
            if status != 200:
                return httpx.Response(status, json={"error": {"message": error, "type": "permission_error"}})
            return httpx.Response(200, json={"created": 0, "data": [{"b64_json": base64.b64encode(PNG).decode()}]})

        def client(**kwargs):
            return RealOpenAI(**kwargs, base_url="https://api.openai.com/v1",
                              http_client=httpx.Client(transport=httpx.MockTransport(handler)))

        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.dict(os.environ, {"OPENAI_API_KEY": "" if missing_key else FAKE_KEY}), \
                patch("openai.OpenAI", side_effect=client) as constructor, \
                redirect_stdout(stdout), redirect_stderr(stderr):
            code = MODULE.main([*args, "--output-dir", str(self.output), "--max-retries", "0"])
        return code, json.loads(stdout.getvalue()), constructor.call_count, stdout.getvalue() + stderr.getvalue()

    def test_dry_run_needs_no_key_or_files(self):
        code, result, calls, _ = self.invoke(["white ceramic mug", "--dry-run", "--no-reference"], missing_key=True)
        self.assertEqual(code, 0)
        self.assertEqual(result["model"], "gpt-image-2.6-flare")
        self.assertEqual(result["size"], "1536x864")
        self.assertEqual(result["operation"], "generate")
        self.assertEqual(calls, 0)
        self.assertFalse(self.output.exists())

    def test_text_generation_and_complexity_use_correct_api_body(self):
        code, result, _, _ = self.invoke(["a mug", "--size", "auto", "--no-reference", "--complexity", "low"])
        self.assertEqual(code, 0)
        self.assertEqual(self.requests[0].url.path, "/v1/images/generations")
        body = json.loads(self.requests[0].content)
        self.assertEqual(body["model"], "gpt-image-2.6-flare")
        self.assertEqual(body["complexity"], "low")
        self.assertNotIn("image", body)
        self.assertNotIn("extra_body", body)
        self.assertEqual((self.output / "image.png").read_bytes(), PNG)
        self.assertEqual(result["actual_size"], "1x1")
        self.assertEqual((self.output / "prompt.md").read_text(), "a mug")

    def test_references_select_multipart_edit_and_preserve_full_model_id(self):
        reference = self.root / "reference.png"
        reference.write_bytes(PNG)
        code, result, _, _ = self.invoke(["change the angle", "--size", "auto", "--model", "gpt-image-2.5-sunburst", "--image", str(reference)])
        self.assertEqual(code, 0)
        request = self.requests[0]
        self.assertEqual(request.url.path, "/v1/images/edits")
        self.assertIn("multipart/form-data", request.headers["content-type"])
        self.assertIn(b"reference.png", request.content)
        self.assertIn(b"gpt-image-2.5-sunburst", request.content)
        self.assertEqual(result["operation"], "edit")
        self.assertEqual(result["reference_images"], [str(reference.resolve())])

    def test_size_mismatch_is_reported_and_image_preserved(self):
        code, result, _, _ = self.invoke(["a mug", "--size", "1024x1024"])
        self.assertEqual(code, 1)
        self.assertFalse(result["size_matches_request"])
        self.assertEqual(result["actual_size"], "1x1")
        self.assertEqual((self.output / "image.png").read_bytes(), PNG)

    def test_api_error_never_leaks_credentials_to_logs_or_files(self):
        code, result, _, logs = self.invoke(["a mug"], status=403, error=f"Denied credential {FAKE_KEY}")
        self.assertEqual(code, 1)
        self.assertEqual(result["status_code"], 403)
        self.assertNotIn(FAKE_KEY, logs)
        for path in self.output.iterdir():
            self.assertNotIn(FAKE_KEY, path.read_text())
        self.assertFalse((self.output / "image.png").exists())

    def test_existing_output_is_preserved_before_any_api_request(self):
        self.output.mkdir()
        image = self.output / "image.png"
        image.write_bytes(b"original")
        code, result, calls, _ = self.invoke(["a mug"])
        self.assertEqual(code, 1)
        self.assertFalse(result["success"])
        self.assertEqual(calls, 0)
        self.assertEqual(image.read_bytes(), b"original")

    def test_missing_key_stops_without_output(self):
        code, result, calls, _ = self.invoke(["a mug"], missing_key=True)
        self.assertEqual(code, 1)
        self.assertFalse(result["success"])
        self.assertEqual(calls, 0)
        self.assertFalse(self.output.exists())

    def test_no_reference_flag_rejects_accidental_upload(self):
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
            MODULE.main(["a mug", "--no-reference", "--image", "reference.png", "--dry-run"])
        self.assertEqual(error.exception.code, 2)

    def test_invalid_size_is_rejected_before_api(self):
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
            MODULE.main(["a mug", "--size", "4000x4000", "--dry-run"])
        self.assertEqual(error.exception.code, 2)
        self.assertFalse(self.requests)


if __name__ == "__main__":
    unittest.main()
