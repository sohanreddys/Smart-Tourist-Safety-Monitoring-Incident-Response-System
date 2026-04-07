import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, ActivityIndicator, StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import MapScreen from './src/screens/MapScreen';
import SOSScreen from './src/screens/SOSScreen';
import EmergencyServicesScreen from './src/screens/EmergencyServicesScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import ProfileScreen from './src/screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TabIcon = ({ label, focused }) => {
  const icons = { Map: '📍', SOS: '🚨', Services: '🏥', Alerts: '🔔', Profile: '👤' };
  const isSOSTab = label === 'SOS';
  return (
    <View style={[
      { alignItems: 'center' },
      isSOSTab && { marginTop: -18 },
    ]}>
      {isSOSTab ? (
        <View style={{
          width: 56, height: 56, borderRadius: 28,
          backgroundColor: focused ? '#dc2626' : '#ef4444',
          justifyContent: 'center', alignItems: 'center',
          shadowColor: '#dc2626', shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4, shadowRadius: 8, elevation: 10,
          borderWidth: 3, borderColor: '#fff',
        }}>
          <Text style={{ fontSize: 24 }}>🚨</Text>
        </View>
      ) : (
        <>
          <Text style={{ fontSize: 20 }}>{icons[label] || '•'}</Text>
          <Text style={{ fontSize: 9, color: focused ? '#2563eb' : '#9ca3af', fontWeight: focused ? '700' : '400', marginTop: 2 }}>
            {label}
          </Text>
        </>
      )}
    </View>
  );
};

const RESPONDER_ROLES = ['admin', 'medical', 'police', 'fire', 'disaster'];

const MainTabs = () => {
  const { user } = useAuth();
  const isResponder = user && RESPONDER_ROLES.includes(user.role);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: 72,
          paddingTop: 8,
          paddingBottom: 14,
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e5e7eb',
        },
      })}
    >
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Services" component={EmergencyServicesScreen} />
      {!isResponder && <Tab.Screen name="SOS" component={SOSScreen} />}
      <Tab.Screen name="Alerts" component={AlertsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
  </Stack.Navigator>
);

const RootNavigator = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Loading WanderMate...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e40af',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
  },
});
