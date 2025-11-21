import os
import google.genai as genai
from google.genai import types
import json
import datetime

def load_schedule():
    try:
        with open("schedule.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"events": []}

def save_schedule(schedule):
    with open("schedule.json", "w") as f:
        json.dump(schedule, f, indent=4)

# Define tools for the model
function_declarations = [
    {
        "name": "add_event",
        "description": "Add a new event to the schedule. For recurring events, specify the recurring details.",
        "parameters": {
            "type": "object",
            "properties": {
                "description": {"type": "string", "description": "Description of the event"},
                "date": {"type": "string", "description": "Date of the event (for single events)"},
                "time": {"type": "string", "description": "Time of the event"},
                "recurring": {
                    "type": "object",
                    "description": "Details for recurring events",
                    "properties": {
                        "frequency": {"type": "string", "description": "e.g., weekly"},
                        "days": {"type": "array", "items": {"type": "string"}, "description": "List of days, e.g., ['monday', 'tuesday']"},
                        "count": {"type": "integer", "description": "Number of occurrences"}
                    }
                }
            },
            "required": ["description"]
        }
    },
    {
        "name": "list_events",
        "description": "List all events in the schedule, optionally filtered by date",
        "parameters": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "Optional date filter in YYYY-MM-DD format"}
            }
        }
    },
    {
        "name": "remove_event",
        "description": "Remove an event by index (0-based)",
        "parameters": {
            "type": "object",
            "properties": {"index": {"type": "integer", "description": "Index of the event to remove"}},
            "required": ["index"]
        }
    },
    {
        "name": "get_current_date",
        "description": "Get the current date in YYYY-MM-DD format",
        "parameters": {"type": "object", "properties": {}}
    }
]

tools = [
    types.Tool(function_declarations=function_declarations)
]

# Set up the API key from environment variable
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("Please set the GEMINI_API_KEY environment variable.")
    exit(1)

client = genai.Client(api_key=api_key)
model = "gemini-2.0-flash"
config = types.GenerateContentConfig(tools=tools)

# Load schedule
schedule = load_schedule()

# Initialize contents with initial prompt
contents = [
    types.Content(
        role="user",
        parts=[
            types.Part(text=f"""You are a personal scheduling assistant. Manage the user's schedule using the available tools. 
Current date: {datetime.date.today().strftime('%Y-%m-%d')}. 
Current schedule: {json.dumps(schedule)}

When the user asks you to decide or choose a time, analyze their current schedule and suggest available time slots that don't conflict with existing events. 
Be proactive in suggesting times based on:
- Avoiding conflicts with existing events
- Common preferences (e.g., morning for exercise, afternoon for meetings)
- Gaps in their schedule
Always provide 2-3 time options when suggesting.

When the user mentions a problem, goal, or improvement area (like "I lack GK", "I need to exercise", "I want to learn coding"), 
be helpful and proactive. Suggest adding relevant events or tasks to their schedule to help them achieve their goal.
For example:
- "I lack GK" → Suggest adding daily/weekly GK reading or quiz sessions
- "I need to exercise" → Suggest adding workout sessions
- "I want to learn X" → Suggest adding study/practice sessions

Always relate their goals back to their schedule and offer to help them make time for improvement.""")
        ],
    ),
]

print("Chat with Gemini Flash 2.0. Type 'exit' to quit.")

while True:
    user_input = input("You: ")
    if user_input.lower() == 'exit':
        break
    contents.append(types.Content(role="user", parts=[types.Part(text=user_input)]))
    
    response = client.models.generate_content(model=model, contents=contents, config=config)
    
    if not response.candidates or not response.candidates[0].content.parts:
        print("Gemini: No response received.")
        continue
    
    for part in response.candidates[0].content.parts:
        if part.text:
            print("Gemini:", part.text)
            contents.append(types.Content(role="model", parts=[types.Part(text=part.text)]))
        if part.function_call:
            call = part.function_call
            result = ""
            if call.name == "add_event":
                desc = call.args.get("description", "")
                date = call.args.get("date", "")
                time = call.args.get("time", "")
                recurring = call.args.get("recurring")
                if not desc:
                    result = "Description is required."
                elif not time:
                    result = "Time is required for all events."
                elif recurring:
                    # Handle recurring
                    frequency = recurring.get("frequency", "weekly")
                    days = recurring.get("days", [])
                    count = recurring.get("count", 4)
                    if not days:
                        result = "Days are required for recurring events."
                    else:
                        today = datetime.date.today()
                        days_map = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}
                        added = []
                        for day in days:
                            day_num = days_map.get(day.lower())
                            if day_num is not None:
                                days_ahead = (day_num - today.weekday()) % 7
                                if days_ahead == 0:
                                    days_ahead = 7
                                event_date = today + datetime.timedelta(days=days_ahead)
                                for _ in range(count):
                                    schedule["events"].append({"description": desc, "date": event_date.strftime("%Y-%m-%d"), "time": time})
                                    added.append(f"{day} {event_date.strftime('%Y-%m-%d')}")
                                    event_date += datetime.timedelta(days=7)
                        result = f"Added recurring events: {desc} on {', '.join(added)}"
                        save_schedule(schedule)
                else:
                    if not date:
                        result = "Date is required for single events."
                    else:
                        event = {"description": desc, "date": date, "time": time}
                        schedule["events"].append(event)
                        result = f"Added event: {desc} on {date} at {time}"
                        save_schedule(schedule)
            elif call.name == "list_events":
                date_filter = call.args.get("date")
                filtered_events = schedule["events"]
                if date_filter:
                    filtered_events = [e for e in schedule["events"] if e["date"] == date_filter]
                if filtered_events:
                    result = "\n".join([f"{i}. {e['description']} on {e['date']} at {e['time']}" for i, e in enumerate(filtered_events)])
                else:
                    result = f"No events scheduled{' on ' + date_filter if date_filter else ''}."
            elif call.name == "remove_event":
                index = call.args.get("index", -1)
                if 0 <= index < len(schedule["events"]):
                    removed = schedule["events"].pop(index)
                    save_schedule(schedule)
                    result = f"Removed event: {removed['description']}"
                else:
                    result = "Invalid index."
            elif call.name == "get_current_date":
                result = datetime.date.today().strftime("%Y-%m-%d")
            if result:
                # Send the function response
                contents.append(types.Content(
                    role="model",
                    parts=[types.Part(function_response=types.FunctionResponse(name=call.name, response={"result": result}))]
                ))
                # Then, generate follow-up response
                follow_up = client.models.generate_content(model=model, contents=contents, config=config)
                if follow_up.candidates and follow_up.candidates[0].content.parts:
                    for fpart in follow_up.candidates[0].content.parts:
                        if fpart.text:
                            print("Gemini:", fpart.text)
                            contents.append(types.Content(role="model", parts=[types.Part(text=fpart.text)]))
                        # If more calls, but for simplicity, assume one
