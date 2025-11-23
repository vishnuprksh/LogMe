import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatSession, loadSchedule, saveSchedule, loadUserProfile, saveUserProfile, functionDeclarations } from './chatbot';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
}

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const [session, setSession] = useState<ChatSession | null>(null);

  useEffect(() => {
    initializeSession();
  }, []);

  const initializeSession = async () => {
    const schedule = await loadSchedule();
    const userProfile = await loadUserProfile();
    const newSession = new ChatSession(schedule, userProfile);
    setSession(newSession);
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !session) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    session.addUserMessage(inputText);

    // Refresh schedule and profile before generating response
    session.schedule = await loadSchedule();
    session.userProfile = await loadUserProfile();
    // Update the initial prompt with current data
    session.contents[0].parts[0].text = `You are a personal scheduling assistant. Manage the user's schedule using the available tools. 
Current date: ${new Date().toISOString().split('T')[0]}. 
Current schedule: ${JSON.stringify(session.schedule)}
User profile: ${JSON.stringify(session.userProfile)}

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

Always relate their goals back to their schedule and offer to help them make time for improvement.`;

    try {
      const genAI = new GoogleGenerativeAI(API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
        tools: [{ functionDeclarations: functionDeclarations as any }],
      });

      const result = await model.generateContent({
        contents: session.contents,
      });

      const response = result.response;
      const parts = response.candidates?.[0]?.content?.parts || [];

      let responseText = '';
      for (const part of parts) {
        if (part.text) {
          responseText += part.text;
        }
        if (part.functionCall) {
          const result = await session.handleFunctionCall(part.functionCall);
          // Now generate follow-up
          const followUp = await model.generateContent({
            contents: session.contents,
          });
          const followParts = followUp.response.candidates?.[0]?.content?.parts || [];
          for (const fpart of followParts) {
            if (fpart.text) {
              responseText += fpart.text;
            }
          }
        }
      }

      if (responseText) {
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: responseText,
          isUser: false,
        };
        setMessages(prev => [...prev, botMessage]);
        session.addModelResponse(responseText);
      }
    } catch (error) {
      console.error(error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, something went wrong.',
        isUser: false,
      };
      setMessages(prev => [...prev, errorMessage]);
    }

    setIsLoading(false);
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[styles.messageContainer, item.isUser ? styles.userMessage : styles.botMessage]}>
      <Text style={styles.messageText}>{item.text}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior="height" keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        style={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type your message..."
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage} disabled={isLoading}>
          <Text style={styles.sendButtonText}>{isLoading ? '...' : 'Send'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  messagesList: {
    flex: 1,
    padding: 10,
  },
  messageContainer: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 10,
    marginVertical: 5,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  botMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E5EA',
  },
  messageText: {
    color: '#000',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ccc',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    maxHeight: 100,
  },
  sendButton: {
    marginLeft: 10,
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
