import React, { useEffect, useState } from 'react';
import { logout, reset } from '@addressiq/react-native';
import LoginScreen from './screens/LoginScreen';
import VerificationScreen from './screens/VerificationScreen';
import HelpersScreen from './screens/HelpersScreen';
import AddressesScreen from './screens/AddressesScreen';
import DeveloperScreen from './screens/DeveloperScreen';
import { clearSession, loadSession, saveSession, type SessionData } from './storage';

type Screen = 'login' | 'verification' | 'helpers' | 'addresses' | 'developer';

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [session, setSession] = useState<SessionData | null>(null);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedVerification, setSelectedVerification] = useState('');

  useEffect(() => {
    void loadSession().then((s) => {
      if (s) {
        setSession(s);
        setScreen('verification');
      }
    });
  }, []);

  const handleLogin = async (data: SessionData) => {
    await saveSession(data);
    setSession(data);
    setScreen('verification');
  };

  const handleLogout = async () => {
    await logout().catch(() => undefined);
    await clearSession();
    setSession(null);
    setScreen('login');
  };

  const handleReset = async () => {
    await reset().catch(() => undefined);
    await clearSession();
    setSession(null);
    setScreen('login');
  };

  if (screen === 'login' || !session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (screen === 'helpers') {
    return <HelpersScreen onBack={() => setScreen('verification')} />;
  }

  if (screen === 'addresses') {
    return (
      <AddressesScreen
        onBack={() => setScreen('verification')}
        onVerify={(locationCode, verificationCode) => {
          setSelectedLocation(locationCode);
          setSelectedVerification(verificationCode);
          setScreen('verification');
        }}
      />
    );
  }

  if (screen === 'developer') {
    return (
      <DeveloperScreen
        defaultLocationCode={selectedLocation}
        defaultVerificationCode={selectedVerification}
        onBack={() => setScreen('verification')}
      />
    );
  }

  return (
    <VerificationScreen
      session={session}
      initialLocationCode={selectedLocation || undefined}
      onOpenHelpers={() => setScreen('helpers')}
      onOpenAddresses={() => setScreen('addresses')}
      onOpenDeveloper={() => setScreen('developer')}
      onLogout={handleLogout}
      onReset={handleReset}
    />
  );
}
