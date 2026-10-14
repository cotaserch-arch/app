// Clutch for iPhone and Android: the web app in a native shell, plus push
// notifications for pick results.
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

const APP_URL = Constants.expoConfig?.extra?.appUrl ?? "https://YOUR-CLUTCH-DOMAIN.com";
const USER_AGENT = Platform.OS === "ios" ? "ClutchIOS/1.0" : "ClutchAndroid/1.0";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Asks permission once, then sends this device's push token to the server
// under the fan's profile.
async function registerForPush(fanToken) {
  if (!Device.isDevice) return;
  const { status: existing } = await Notifications.getPermissionsAsync();
  const { status } = existing === "granted" ? { status: existing } : await Notifications.requestPermissionsAsync();
  if (status !== "granted") return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Game results", importance: Notifications.AndroidImportance.DEFAULT });
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: pushToken } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await fetch(`${APP_URL}/api/me/push`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-fan-token": fanToken },
    body: JSON.stringify({ token: pushToken }),
  });
}

function urlFromNotification(response) {
  const path = response?.notification?.request?.content?.data?.url;
  return typeof path === "string" && path.startsWith("/") ? `${APP_URL}${path}` : null;
}

export default function App() {
  const webview = useRef(null);
  const registered = useRef(false);
  const canGoBack = useRef(false);
  const [uri, setUri] = useState(() => urlFromNotification(Notifications.getLastNotificationResponse()) ?? APP_URL);
  const [failed, setFailed] = useState(false);

  // Tapping a notification opens that game.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const next = urlFromNotification(response);
      if (next) setUri(`${next}${next.includes("?") ? "&" : "?"}t=${Date.now()}`);
    });
    return () => sub.remove();
  }, []);

  // Android back button goes back inside the app first.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack.current) return false;
      webview.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  function onMessage(event) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "fan" && typeof msg.token === "string" && !registered.current) {
        registered.current = true;
        registerForPush(msg.token).catch(() => {
          registered.current = false;
        });
      }
    } catch {
      // Ignore messages that aren't ours.
    }
  }

  // Links that leave Clutch (mail, partners, sponsors) open in the system browser.
  function onShouldStartLoadWithRequest(request) {
    if (request.url.startsWith(APP_URL) || request.url.startsWith("about:")) return true;
    Linking.openURL(request.url).catch(() => {});
    return false;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
        <StatusBar style="light" />
        {failed ? (
          <View style={styles.center}>
            <Text style={styles.title}>You're offline</Text>
            <Text style={styles.body}>Clutch needs a connection to load today's games.</Text>
            <Pressable
              style={styles.button}
              onPress={() => {
                setFailed(false);
                webview.current?.reload();
              }}
            >
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            ref={webview}
            source={{ uri }}
            style={styles.root}
            applicationNameForUserAgent={USER_AGENT}
            onMessage={onMessage}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            onNavigationStateChange={(nav) => {
              canGoBack.current = nav.canGoBack;
            }}
            onError={() => setFailed(true)}
            startInLoadingState
            renderLoading={() => (
              <View style={[styles.center, StyleSheet.absoluteFill]}>
                <ActivityIndicator color="#2bff88" size="large" />
              </View>
            )}
            pullToRefreshEnabled
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            decelerationRate="normal"
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#05080f" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#05080f" },
  title: { color: "#f2f5ff", fontSize: 22, fontWeight: "800", marginBottom: 8 },
  body: { color: "#aeb8d6", fontSize: 16, textAlign: "center", marginBottom: 20 },
  button: { backgroundColor: "#2bff88", paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  buttonText: { color: "#04140b", fontWeight: "800", fontSize: 16 },
});
