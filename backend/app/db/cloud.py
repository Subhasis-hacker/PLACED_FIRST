from imagekitio import ImageKit
from dotenv import load_dotenv
import os

load_dotenv()

imagekit = ImageKit(
    private_key=os.getenv("IMAGEKIT_PRIVATE_KEY")
)
# url = imagekit.url({
#     "path": "/uploaded_image.jpg"
# })
def upload_to_cloud(file, filename):
    result = imagekit.upload_file(
        file=file,
        file_name=filename,
    )

    return result.response_metadata.raw