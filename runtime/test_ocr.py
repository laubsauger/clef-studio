"""Exercise the native Apple Vision helper with a known profile-text image."""
import io
import json
import subprocess
import unittest
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


class ProfileOCRTest(unittest.TestCase):
    def test_visible_name_age_and_bio(self):
        image = Image.new("RGB", (600, 800), "#15202a")
        draw = ImageDraw.Draw(image)
        font = ImageFont.load_default(size=36)
        for y, text in [(100, "Sofia, 29"), (200, "Lisbon"), (300, "Designer"), (400, "Weekend hikes"), (500, "Long-term relationship")]:
            draw.text((35, y), text, fill="white", font=font)
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        binary = Path(__file__).parent / "bin" / "profile-ocr"
        process = subprocess.run([str(binary)], input=buffer.getvalue(), capture_output=True, check=True, timeout=20)
        result = json.loads(process.stdout)
        self.assertIn("Sofia, 29", result["text"])
        self.assertIn("Lisbon", result["text"])
        self.assertIn("Weekend hikes", result["text"])
        self.assertEqual(result["engine"], "Apple Vision")
        self.assertEqual((result["width"], result["height"]), (600, 800))
        self.assertGreater(len(result["lines"]), 3)


if __name__ == "__main__":
    unittest.main()
