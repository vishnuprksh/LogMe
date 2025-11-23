import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Event {
  description: string;
  date: string;
  time: string;
}

interface Schedule {
  events: Event[];
}

export default function Calendar() {
  const [events, setEvents] = useState<Event[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadEvents = async () => {
    try {
      setRefreshing(true);
      const data = await AsyncStorage.getItem('schedule');
      const schedule: Schedule = data ? JSON.parse(data) : { events: [] };
      setEvents(schedule.events);
    } catch (error) {
      console.error('Failed to load events:', error);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [])
  );

  const renderEvent = ({ item }: { item: Event }) => (
    <View style={styles.eventItem}>
      <Text style={styles.eventDescription}>{item.description}</Text>
      <Text style={styles.eventDetails}>{item.date} at {item.time}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scheduled Events</Text>
      <TouchableOpacity style={styles.loadButton} onPress={loadEvents} disabled={refreshing}>
        <Text style={styles.loadButtonText}>{refreshing ? 'Loading...' : 'Load Events'}</Text>
      </TouchableOpacity>
      <FlatList
        data={events}
        renderItem={renderEvent}
        keyExtractor={(item, index) => index.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadEvents} />}
        ListEmptyComponent={<Text style={styles.emptyText}>No events scheduled.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  loadButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    marginBottom: 20,
    alignItems: 'center',
  },
  loadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  eventItem: {
    backgroundColor: '#f9f9f9',
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
  },
  eventDescription: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  eventDetails: {
    fontSize: 14,
    color: '#666',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#999',
    marginTop: 50,
  },
});
