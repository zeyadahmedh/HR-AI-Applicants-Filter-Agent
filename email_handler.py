import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_email(sender_email, smtp_password, receiver_email, subject, body):
    """
    Send an email using Gmail SMTP.

    Args:
        sender_email (str): Your Gmail address
        smtp_password (str): Your app password
        receiver_email (str): Recipient email address
        subject (str): Email subject
        body (str): Email body text
    """
    try:
        # Create the email message
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = receiver_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))

        # Connect to Gmail SMTP server
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(sender_email, smtp_password)
        server.send_message(msg)
        server.quit()

        print(f"Email sent to {receiver_email}")

    except Exception as e:
        print(f"Failed to send email to {receiver_email}: {e}")
