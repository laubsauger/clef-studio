"""Exercise the actual image processor without loading model weights or using the GPU."""
import unittest
from PIL import Image
from transformers import AutoProcessor
from download import MODEL_PATH
from server import VISION_SIZE


class ImageBudgetTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.processor = AutoProcessor.from_pretrained(MODEL_PATH, local_files_only=True)

    def test_large_upload_obeys_image_budget(self):
        encoded = self.processor(
            text=["<|vision_start|><|image_pad|><|vision_end|>\n"],
            images=[Image.new("RGB", (1280, 960))],
            return_tensors="pt",
            size=VISION_SIZE,
        )
        frames, height, width = encoded["image_grid_thw"][0].tolist()
        self.assertLessEqual(frames * height * width * self.processor.image_processor.patch_size ** 2, VISION_SIZE["longest_edge"])
        self.assertLessEqual(frames * height * width // self.processor.image_processor.merge_size ** 2, 256)


if __name__ == "__main__":
    unittest.main()
