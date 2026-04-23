import { useMemo, useRef } from "react";
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View, useColorScheme } from "react-native";
import { useRouter } from "expo-router";
import { CalendarPlus, ChevronLeft } from "lucide-react-native";
import AddLumaEventSheet, { AddLumaEventSheetRef } from "./AddLumaEventSheet";

export default function EventsScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === "dark";
  const sheetRef = useRef<AddLumaEventSheetRef>(null);

  const t = useMemo(
    () => ({
      bg: isDark ? "#0A0410" : "#FFFFFF",
      card: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
      border: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
      text: isDark ? "#FFFFFF" : "#111827",
      muted: isDark ? "rgba(255,255,255,0.55)" : "rgba(17,24,39,0.55)",
      accent: "#A855F7",
    }),
    [isDark]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={22} color={t.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Events</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
        <Text style={[styles.emptyTitle, { color: t.text }]}>No events yet</Text>
        <Text style={[styles.emptyDesc, { color: t.muted }]}>
          Your active and past events will appear here.
        </Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.86}
        onPress={() => sheetRef.current?.present()}
        style={[styles.cta, { backgroundColor: "rgba(168,85,247,0.16)", borderColor: "rgba(168,85,247,0.35)" }]}
      >
        <CalendarPlus size={18} color={t.accent} strokeWidth={1.8} />
        <Text style={[styles.ctaText, { color: t.accent }]}>Create event</Text>
      </TouchableOpacity>

      <AddLumaEventSheet ref={sheetRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 14,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Dank Mono Bold",
    fontSize: 16,
    includeFontPadding: false,
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
  },
  emptyTitle: {
    fontFamily: "Dank Mono Bold",
    fontSize: 16,
    includeFontPadding: false,
    marginBottom: 6,
  },
  emptyDesc: {
    fontFamily: "Dank Mono",
    fontSize: 13,
    lineHeight: 20,
    includeFontPadding: false,
  },
  cta: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontFamily: "Dank Mono Bold",
    fontSize: 14,
    includeFontPadding: false,
  },
});

