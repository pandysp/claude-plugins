"""Offline tests for transcribe.py: the guarantees that cost money when they break.

Run: python3 -m unittest discover -s plugins/transcribe/test
"""

import fcntl
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "skills" / "transcribe" / "scripts" / "transcribe.py"
spec = importlib.util.spec_from_file_location("transcribe", SCRIPT)
transcribe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transcribe)


def result(transcript_id, text="Hallo."):
    return {"id": transcript_id, "status": "completed", "audio_duration": 3.0, "language_code": "de",
            "language_confidence": 0.9, "speech_model_used": "universal-3-5-pro", "words": [{}],
            "utterances": [{"speaker": "A", "start": 0, "text": text}]}


class FakeClient:
    """Stands in for AssemblyAI. Tests script failures by queueing exceptions per method."""
    calls, fail, submitted = [], {}, 0

    def __init__(self, region):
        self.region = region

    def _maybe_fail(self, method):
        if FakeClient.fail.get(method):
            raise FakeClient.fail[method].pop(0)

    def upload(self, path):
        FakeClient.calls.append(("upload", path.name))
        return "upload-url"

    def submit(self, url):
        self._maybe_fail("submit")
        FakeClient.submitted += 1
        transcript_id = f"t{FakeClient.submitted}"
        FakeClient.calls.append(("submit", transcript_id))
        return transcript_id

    def wait(self, transcript_id, deadline):
        FakeClient.calls.append(("wait", transcript_id))
        self._maybe_fail("wait")
        return result(transcript_id)

    def delete(self, transcript_id):
        FakeClient.calls.append(("delete", transcript_id))
        self._maybe_fail("delete")


class TranscribeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        (self.base / "audio").mkdir()
        self.audio("call.m4a", b"one")
        FakeClient.calls, FakeClient.fail, FakeClient.submitted = [], {}, 0
        transcribe.Client = FakeClient

    def tearDown(self):
        self.tmp.cleanup()

    def audio(self, name, data):
        (self.base / "audio" / name).write_bytes(data)

    def run_script(self, *extra):
        sys.argv = ["transcribe.py", "--base-dir", str(self.base), *extra]
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()) as err:
            code = transcribe.main()
        self.stderr = err.getvalue()
        return code

    def kinds(self):
        return [c[0] for c in FakeClient.calls]

    def note(self, name="call.md"):
        return (self.base / "transcripts" / name).read_text(encoding="utf-8")

    def test_writes_note_deletes_remote_and_a_rerun_costs_nothing(self):
        self.assertEqual(self.run_script(), 0)
        self.assertEqual(self.kinds(), ["upload", "submit", "wait", "delete"])
        self.assertIn('language: "de"', self.note())
        self.assertIn('region: "eu"', self.note())
        self.assertTrue((self.base / ".transcribe" / "t1.json").exists())
        FakeClient.calls = []
        (self.base / "transcripts" / "call.md").rename(self.base / "filed.md")  # filed elsewhere
        self.assertEqual(self.run_script(), 0)
        self.assertEqual(FakeClient.calls, [])

    def test_interrupted_job_resumes_instead_of_paying_again(self):
        FakeClient.fail = {"wait": [transcribe.HTTPFailure(None, "connection dropped")]}
        self.assertEqual(self.run_script(), 1)
        FakeClient.calls = []
        self.assertEqual(self.run_script(), 0)
        self.assertEqual(FakeClient.calls, [("wait", "t1"), ("delete", "t1")])

    def test_changed_recording_is_not_skipped_or_paid_for_silently(self):
        self.run_script()
        self.audio("call.m4a", b"different bytes")
        FakeClient.calls = []
        self.assertEqual(self.run_script(), 1)
        self.assertIn("changed since it was transcribed", self.stderr)
        self.assertEqual(FakeClient.calls, [])

    def test_existing_note_is_never_overwritten(self):
        (self.base / "transcripts").mkdir()
        (self.base / "transcripts" / "call.md").write_text("hand corrected", encoding="utf-8")
        self.assertEqual(self.run_script(), 0)
        self.assertEqual(self.note(), "hand corrected")
        self.assertIn("Hallo.", self.note("call.t1.md"))

    def test_retranscribe_pays_again_but_keeps_the_corrected_note(self):
        self.run_script()
        (self.base / "transcripts" / "call.md").write_text("hand corrected", encoding="utf-8")
        FakeClient.calls = []
        self.assertEqual(self.run_script("--retranscribe"), 0)
        self.assertEqual(self.kinds(), ["upload", "submit", "wait", "delete"])
        self.assertEqual(self.note(), "hand corrected")
        self.assertTrue((self.base / "transcripts" / "call.t2.md").exists())

    def test_failed_remote_delete_is_retried_alone(self):
        FakeClient.fail = {"delete": [transcribe.HTTPFailure(503, "unavailable")]}
        self.assertEqual(self.run_script(), 1)
        FakeClient.calls = []
        self.assertEqual(self.run_script(), 0)
        self.assertEqual(FakeClient.calls, [("delete", "t1")])

    def test_one_failure_does_not_stop_the_batch(self):
        self.audio("second.m4a", b"two")
        FakeClient.fail = {"submit": [transcribe.HTTPFailure(500, "boom")]}
        self.assertEqual(self.run_script(), 1)
        self.assertTrue((self.base / "transcripts" / "second.md").exists())

    def test_keep_remote_skips_the_delete(self):
        self.assertEqual(self.run_script("--keep-remote"), 0)
        self.assertNotIn("delete", self.kinds())

    def test_ledger_from_the_previous_version_counts_as_paid(self):
        (self.base / ".transcribed").write_text("old-id\tcall\n", encoding="utf-8")
        self.assertEqual(self.run_script(), 0)
        self.assertEqual(FakeClient.calls, [])

    def test_a_second_run_on_the_same_base_dir_is_refused(self):
        (self.base / ".transcribe").mkdir()
        holder = (self.base / ".transcribe" / "lock").open("w")
        fcntl.flock(holder, fcntl.LOCK_EX)
        try:
            self.assertEqual(self.run_script(), 2)
            self.assertIn("another transcribe run", self.stderr)
            self.assertEqual(FakeClient.calls, [])
        finally:
            holder.close()

    def test_unknown_metadata_stays_unknown(self):
        bare = {"id": "x", "utterances": [], "text": None}
        note = transcribe.to_markdown(bare, "call", "eu")
        self.assertIn("duration: null", note)
        self.assertIn("model: null", note)


if __name__ == "__main__":
    unittest.main()
