import * as fs from 'fs';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import * as path from 'path';

interface Event {
  description: string;
  date: string;
  time: string;
}

interface Schedule {
  events: Event[];
}

interface Recurring {
  frequency: string;
  days: string[];
  count: number;
}

interface AddEventArgs {
  description: string;
  date?: string;
  time: string;
  recurring?: Recurring;
}

interface ListEventsArgs {
  date?: string;
}

interface RemoveEventArgs {
  index: number;
}

interface UpdateProfileArgs {
  updates: Record<string, any>;
}

function loadSchedule(): Schedule {
  try {
    const data = fs.readFileSync('schedule.json', 'utf-8');
    return JSON.parse(data);
  } catch {
    return { events: [] };
  }
}

function saveSchedule(schedule: Schedule): void {
  fs.writeFileSync('schedule.json', JSON.stringify(schedule, null, 4));
}

function loadUserProfile(): Record<string, any> {
  try {
    const data = fs.readFileSync('user_profile.json', 'utf-8');
    const profile = JSON.parse(data);
    if ('profile_text' in profile) {
      const newProfile: Record<string, any> = {};
      for (const line of profile.profile_text.split('\n')) {
        if (line.includes(':')) {
          const [key, value] = line.split(':', 2);
          newProfile[key.trim().toLowerCase()] = value.trim();
        }
      }
      return newProfile;
    }
    return profile;
  } catch {
    return {};
  }
}

function saveUserProfile(profile: Record<string, any>): void {
  fs.writeFileSync('user_profile.json', JSON.stringify(profile, null, 4));
}

const functionDeclarations = [
  {
    name: 'add_event',
    description: 'Add a new event to the schedule. For recurring events, specify the recurring details.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        description: { type: SchemaType.STRING },
        date: { type: SchemaType.STRING },
        time: { type: SchemaType.STRING },
        recurring: {
          type: SchemaType.OBJECT,
          properties: {
            frequency: { type: SchemaType.STRING },
            days: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            count: { type: SchemaType.INTEGER }
          }
        }
      },
      required: ['description']
    }
  },
  {
    name: 'list_events',
    description: 'List all events in the schedule, optionally filtered by date',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        date: { type: SchemaType.STRING }
      }
    }
  },
  {
    name: 'remove_event',
    description: 'Remove an event by index (0-based)',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        index: { type: SchemaType.INTEGER }
      },
      required: ['index']
    }
  },
  {
    name: 'get_current_date',
    description: 'Get the current date in YYYY-MM-DD format',
    parameters: { type: SchemaType.OBJECT, properties: {} }
  },
  {
    name: 'update_user_profile',
    description: 'Update user profile with any information about the user (name, job, preferences, goals, interests, habits, personality, etc.). Provide updates as key-value pairs.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        updates: {
          type: SchemaType.OBJECT
        }
      },
      required: ['updates']
    }
  },
  {
    name: 'get_user_profile',
    description: 'Get the current user profile information',
    parameters: { type: SchemaType.OBJECT, properties: {} }
  }
];

class ChatSession {
  schedule: Schedule;
  userProfile: Record<string, any>;
  contents: any[];

  constructor() {
    this.schedule = loadSchedule();
    this.userProfile = loadUserProfile();
    this.contents = this.initializeContents();
  }

  private initializeContents() {
    const today = new Date().toISOString().split('T')[0];
    return [
      {
        role: 'user',
        parts: [
          {
            text: `You are a personal scheduling assistant. Manage the user's schedule using the available tools. 
Current date: ${today}. 
Current schedule: ${JSON.stringify(this.schedule)}
User profile: ${JSON.stringify(this.userProfile)}

IMPORTANT: Never mention tool calls, function calls, or show tool outputs in your responses. Just respond naturally based on the results.

When the user asks you to decide or choose a time, analyze their current schedule and suggest available time slots that don't conflict with existing events. 
Be proactive in suggesting times based on:
- Avoiding conflicts with existing events
- User preferences from their profile (morning_start, evening_end, preferred times)
- Common preferences (e.g., morning for exercise, afternoon for meetings)
- Gaps in their schedule
Always provide 2-3 time options when suggesting.

When the user mentions a problem, goal, or improvement area (like "I lack GK", "I need to exercise", "I want to learn coding"), 
be helpful and proactive. Suggest adding relevant events or tasks to their schedule to help them achieve their goal.
For example:
- "I lack GK" → Suggest adding daily/weekly GK reading or quiz sessions
- "I need to exercise" → Suggest adding workout sessions
- "I want to learn X" → Suggest adding study/practice sessions

When the user shares personal information (name, job, preferences, goals, interests, habits, personality traits, etc.), 
silently update their profile using update_user_profile without mentioning it in your response.
Use the user profile to personalize your responses and suggestions based on what you know about them.

Always relate their goals back to their schedule and offer to help them make time for improvement.`
          }
        ]
      }
    ];
  }

  addUserMessage(userInput: string): void {
    this.contents.push({ role: 'user', parts: [{ text: userInput }] });
  }

  addModelResponse(text: string): void {
    this.contents.push({ role: 'model', parts: [{ text }] });
  }

  addFunctionResponse(callName: string, result: any): void {
    this.contents.push({
      role: 'model',
      parts: [{ functionResponse: { name: callName, response: { result } } }]
    });
  }

  handleFunctionCall(call: any): string {
    let result = '';
    if (call.name === 'add_event') {
      const args: AddEventArgs = call.args;
      const desc = args.description;
      const date = args.date;
      const time = args.time;
      const recurring = args.recurring;
      if (!desc) {
        result = 'Description is required.';
      } else if (!time) {
        result = 'Time is required for all events.';
      } else if (recurring) {
        const frequency = recurring.frequency || 'weekly';
        const days = recurring.days;
        const count = recurring.count || 4;
        if (!days || days.length === 0) {
          result = 'Days are required for recurring events.';
        } else {
          const today = new Date();
          const daysMap: Record<string, number> = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
          const added: string[] = [];
          for (const day of days) {
            const dayNum = daysMap[day.toLowerCase()];
            if (dayNum !== undefined) {
              let daysAhead = (dayNum - today.getDay() + 7) % 7;
              if (daysAhead === 0) daysAhead = 7;
              const eventDate = new Date(today);
              eventDate.setDate(today.getDate() + daysAhead);
              for (let i = 0; i < count; i++) {
                this.schedule.events.push({ description: desc, date: eventDate.toISOString().split('T')[0], time });
                added.push(`${day} ${eventDate.toISOString().split('T')[0]}`);
                eventDate.setDate(eventDate.getDate() + 7);
              }
            }
          }
          result = `Added recurring events: ${desc} on ${added.join(', ')}`;
          saveSchedule(this.schedule);
        }
      } else {
        if (!date) {
          result = 'Date is required for single events.';
        } else {
          this.schedule.events.push({ description: desc, date, time });
          result = `Added event: ${desc} on ${date} at ${time}`;
          saveSchedule(this.schedule);
        }
      }
    } else if (call.name === 'list_events') {
      const args: ListEventsArgs = call.args;
      const dateFilter = args.date;
      let filteredEvents = this.schedule.events;
      if (dateFilter) {
        filteredEvents = this.schedule.events.filter(e => e.date === dateFilter);
      }
      if (filteredEvents.length > 0) {
        result = filteredEvents.map((e, i) => `${i}. ${e.description} on ${e.date} at ${e.time}`).join('\n');
      } else {
        result = `No events scheduled${dateFilter ? ' on ' + dateFilter : ''}.`;
      }
    } else if (call.name === 'remove_event') {
      const args: RemoveEventArgs = call.args;
      const index = args.index;
      if (index >= 0 && index < this.schedule.events.length) {
        const removed = this.schedule.events.splice(index, 1)[0];
        saveSchedule(this.schedule);
        result = `Removed event: ${removed.description}`;
      } else {
        result = 'Invalid index.';
      }
    } else if (call.name === 'get_current_date') {
      result = new Date().toISOString().split('T')[0];
    } else if (call.name === 'update_user_profile') {
      const args: UpdateProfileArgs = call.args;
      const updates = args.updates;
      Object.assign(this.userProfile, updates);
      saveUserProfile(this.userProfile);
      result = 'Profile updated';
    } else if (call.name === 'get_user_profile') {
      result = this.userProfile ? JSON.stringify(this.userProfile) : 'No profile information available.';
    }

    if (result) {
      this.addFunctionResponse(call.name, result);
    }
    return result;
  }
}

export { ChatSession, loadSchedule, saveSchedule, loadUserProfile, saveUserProfile, functionDeclarations };
