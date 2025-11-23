import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Settings() {
  const [profile, setProfile] = useState<Record<string, any>>({});
  const [editing, setEditing] = useState(false);
  const [tempProfile, setTempProfile] = useState<Record<string, any>>({});

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await AsyncStorage.getItem('user_profile');
      const parsedProfile = data ? JSON.parse(data) : {};
      setProfile(parsedProfile);
      setTempProfile({ ...parsedProfile });
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  };

  const saveProfile = async () => {
    try {
      await AsyncStorage.setItem('user_profile', JSON.stringify(tempProfile));
      setProfile({ ...tempProfile });
      setEditing(false);
    } catch (error) {
      console.error('Failed to save profile:', error);
    }
  };

  const cancelEdit = () => {
    setTempProfile({ ...profile });
    setEditing(false);
  };

  const updateTempProfile = (key: string, value: string) => {
    setTempProfile({ ...tempProfile, [key]: value });
  };

  const renderProfileItem = (key: string, value: string) => (
    <View key={key} style={styles.profileItem}>
      <Text style={styles.label}>{key.charAt(0).toUpperCase() + key.slice(1)}:</Text>
      {editing ? (
        <TextInput
          style={styles.input}
          value={tempProfile[key] || ''}
          onChangeText={(text) => updateTempProfile(key, text)}
          placeholder={`Enter ${key}`}
        />
      ) : (
        <Text style={styles.value}>{value || 'Not set'}</Text>
      )}
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>User Profile</Text>
      {Object.entries(profile).map(([key, value]) => renderProfileItem(key, value as string))}
      {editing ? (
        <View style={styles.buttonContainer}>
          <Button title="Save" onPress={saveProfile} />
          <Button title="Cancel" onPress={cancelEdit} color="red" />
        </View>
      ) : (
        <Button title="Edit Profile" onPress={() => setEditing(true)} />
      )}
    </ScrollView>
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
  profileItem: {
    marginBottom: 15,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  value: {
    fontSize: 16,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    fontSize: 16,
    borderRadius: 5,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
});
