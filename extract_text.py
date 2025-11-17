import pandas as pd
import numpy as np
from pdfminer.high_level import extract_text
from pdf2image import convert_from_path
import pytesseract
import docx2txt


def extract_text_from_pdf(file_path):
    try:
        text = extract_text(file_path)
        if text.strip():
            return text
        else:
            # Fallback to OCR if no text found
            images = convert_from_path(file_path)
            ocr_text = ""
            for image in images:
                ocr_text += pytesseract.image_to_string(image)
            return ocr_text
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        return ""
    
def extract_text_from_docx(file_path):
    try:
        text = docx2txt.process(file_path)
        return text
    except Exception as e:
        print(f"Error extracting text from DOCX: {e}")
        return ""