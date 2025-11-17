import os
from email_handler import send_email
from extract_text import extract_text_from_pdf, extract_text_from_docx
from preprocessing import preprocess_text
from similarity import similarity_score
from dotenv import load_dotenv
import re
import pandas as pd
load_dotenv()
EMAIL_USER = os.getenv("EMAIL")
EMAIL_PASS = os.getenv("PASSWORD")

Threshold = 0.3

PASS_SUBJECT = "Interview Invitation for AI Engineer Role"
PASS_BODY = """
Dear Candidate,

We reviewed your resume and are excited to invite you to a meeting/interview.

Please reply with your available times.

Best regards,
HR Team
"""

REJECT_SUBJECT = "Application Update for AI Engineer Role"
REJECT_BODY = """
Dear Candidate,

Thank you for applying to the AI Engineer position. 

After reviewing your resume, we regret to inform you that we will not be moving forward with your application at this time.

We appreciate your interest and encourage you to apply for future openings.

Best regards,
HR Team
"""

all_candidates = []

JobDesc_path = 'C:\\Users\\ziyad\\HR-AI-Applicants-Filter-Agent\\job descriptions\\ai_engineer.txt'
with open(JobDesc_path, 'r', encoding='utf-8') as file:
    job_text = file.read()

resumeFolder = 'resumes/'

for file in os.listdir(resumeFolder):
    file_path = os.path.join(resumeFolder, file)
    if file.lower().endswith('.pdf'):
        resume_text = extract_text_from_pdf(file_path)
    elif file.lower().endswith('.docx'):
        resume_text = extract_text_from_docx(file_path)
    else:
        print(f"Unsupported file format: {file}")
        continue
    
    preprocessed_job_text = preprocess_text(job_text)
    preprocessed_resume_text = preprocess_text(resume_text)
    
    score = similarity_score(preprocessed_job_text, preprocessed_resume_text)
    match = re.search(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", resume_text)
    if match:
        candidate_email = match.group(0)
        all_candidates.append((candidate_email, file, score))

print(f"Sending emails to {len(all_candidates)} candidates...")
for candidate_email, file, score in all_candidates:
    if score >= Threshold:
        send_email(EMAIL_USER, EMAIL_PASS, candidate_email, PASS_SUBJECT, PASS_BODY)
        print(f"Passed: Email sent to {candidate_email} ({file}) with similarity {score:.2f}")
    else:
        send_email(EMAIL_USER, EMAIL_PASS, candidate_email, REJECT_SUBJECT, REJECT_BODY)
        print(f"Rejected: Email sent to {candidate_email} ({file}) with similarity {score:.2f}")

# ------------------------
# Step 5: Save CSV report
# ------------------------
report = []
for candidate_email, file, score in all_candidates:
    status = "Passed" if score >= Threshold else "Rejected"
    report.append((candidate_email, file, score, status))

df = pd.DataFrame(report, columns=["Email", "Resume", "Score", "Status"])
df.to_csv("candidates_report.csv", index=False)
print("Pipeline finished. CSV report saved.")