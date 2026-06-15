from fastapi import FastAPI, UploadFile, File, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.schemas import FileResponse
from app.db.models import FileModel
from app.db.db import get_db
from app.db.cloud import upload_to_cloud

app = FastAPI()


@app.post("/upload",response_model=FileResponse)
async def upload(file: UploadFile = File(...),db: AsyncSession = Depends(get_db)):
    content = await file.read()
    url = upload_to_cloud(content,file.filename).get("url")
    obj = FileModel(filename=file.filename,file_url=url)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj