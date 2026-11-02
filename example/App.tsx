import React, {useEffect, useState} from 'react';
import {
  FlatList,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// Dynamic content: changes every second, so the spec masks it with ignoreRegionTestIDs.
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <Text testID="live-clock" style={styles.clock}>
      {now.toLocaleTimeString()}
    </Text>
  );
}

const PROMOS = ['Spring sale: 20% off', 'Free shipping this week', 'New arrivals'];

function PromoCarousel() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI(x => (x + 1) % PROMOS.length), 2500);
    return () => clearInterval(t);
  }, []);
  return (
    <View testID="promo-carousel" style={styles.promo}>
      <Text style={styles.promoText}>{PROMOS[i]}</Text>
    </View>
  );
}

function HomeScreen() {
  return (
    <View style={styles.screen}>
      <Text testID="home-title" style={styles.title}>
        Welcome home
      </Text>
      <LiveClock />
      <PromoCarousel />
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account balance</Text>
        <Text style={styles.cardValue}>$1,234.56</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent activity</Text>
        <Text>Coffee shop · $4.50</Text>
        <Text>Grocery store · $62.10</Text>
      </View>
    </View>
  );
}

const SETTINGS = ['Notifications', 'Privacy', 'Appearance', 'Language', 'About'];

function SettingsScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Settings</Text>
      <FlatList
        testID="settings-list"
        data={SETTINGS}
        keyExtractor={s => s}
        renderItem={({item}) => (
          <View style={styles.row}>
            <Text style={styles.rowText}>{item}</Text>
            <Text style={styles.chevron}>›</Text>
          </View>
        )}
      />
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState<'home' | 'settings'>('home');
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={styles.body}>
        {tab === 'home' ? <HomeScreen /> : <SettingsScreen />}
      </View>
      <View style={styles.tabBar}>
        <TouchableOpacity
          testID="home-tab"
          style={styles.tab}
          onPress={() => setTab('home')}>
          <Text style={[styles.tabText, tab === 'home' && styles.tabActive]}>
            Home
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="settings-tab"
          style={styles.tab}
          onPress={() => setTab('settings')}>
          <Text
            style={[styles.tabText, tab === 'settings' && styles.tabActive]}>
            Settings
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#ffffff'},
  body: {flex: 1},
  screen: {flex: 1, padding: 20},
  title: {fontSize: 28, fontWeight: '700', color: '#111', marginBottom: 8},
  clock: {fontSize: 16, color: '#555', marginBottom: 16},
  promo: {
    backgroundColor: '#5b4bdb',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  promoText: {color: '#fff', fontSize: 18, fontWeight: '600'},
  card: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {fontSize: 14, color: '#666', marginBottom: 6},
  cardValue: {fontSize: 24, fontWeight: '700', color: '#111'},
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  rowText: {fontSize: 17, color: '#111'},
  chevron: {fontSize: 20, color: '#999'},
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
  },
  tab: {flex: 1, alignItems: 'center', paddingVertical: 14},
  tabText: {fontSize: 16, color: '#888'},
  tabActive: {color: '#5b4bdb', fontWeight: '700'},
});
