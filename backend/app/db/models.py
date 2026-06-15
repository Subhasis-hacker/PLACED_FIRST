from sqlalchemy import Column,Integer,String
from app.db.db import Base

class FileModel(Base):
    __tablename__="files"

    id=Column(Integer,primary_key=True)
    filename=Column(String)
    file_url=Column(String)