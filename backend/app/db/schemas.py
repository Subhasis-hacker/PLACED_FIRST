from pydantic import BaseModel


# Response Schema
class FileResponse(BaseModel):
    id: int
    filename: str
    file_url: str

    model_config = {
        "from_attributes": True
    }