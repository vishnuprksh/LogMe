import os
import google.generativeai as genai

# Set up the API key from environment variable
api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    print("Please set the GOOGLE_API_KEY environment variable.")
    exit(1)

genai.configure(api_key=api_key)

# Initialize the model
model = genai.GenerativeModel("gemini-2.0-flash")

# Start a chat session
chat = model.start_chat(history=[])

print("Chat with Gemini Flash 2.0. Type 'exit' to quit.")

while True:
    user_input = input("You: ")
    if user_input.lower() == 'exit':
        break
    response = chat.send_message(user_input)
    print("Gemini:", response.text)
