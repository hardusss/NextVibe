import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View, useColorScheme, FlatList, ActivityIndicator, Linking } from "react-native";
import { useRouter } from "expo-router";
import { CalendarPlus, ChevronLeft, Calendar, Link2, Users } from "lucide-react-native";
import AddLumaEventSheet, { AddLumaEventSheetRef } from "./AddLumaEventSheet";
import EventRequestsSheet, { EventRequestsSheetRef } from "./EventRequestsSheet";
import AttendeesSheet, { AttendeesSheetRef } from "./AttendeesSheet";
import { storage } from "@/src/utils/storage";
import getMenuPosts from "@/src/api/menu.posts";
import { getEventRequests } from "@/src/api/event.requests";
import FastImage from "react-native-fast-image";
import { BlurView } from "@react-native-community/blur";
const formatEventDate = (isoString: string): string => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function EventsScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === "dark";
  const sheetRef = useRef<AddLumaEventSheetRef>(null);

  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const requestsSheetRef = useRef<EventRequestsSheetRef>(null);
  const attendeesSheetRef = useRef<AttendeesSheetRef>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const pendingCount = requests.filter(r => r.status === 'pending').length;

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

  const fetchEvents = useCallback(async (isRefresh = false) => {
      try {
          const userIdStr = await storage.getItem("id");
          if (!userIdStr) return;
          const userId = parseInt(userIdStr, 10);

          const limit = 10;
          const currentIndex = isRefresh ? 0 : pageIndex;
          const res = await getMenuPosts(userId, currentIndex, limit, true);

          if (res.data) {
              const filteredData = res.data.filter((item: any) => item.is_luma_event);
              if (isRefresh) {
                  setEvents(filteredData);
              } else {
                  setEvents(prev => [...prev, ...filteredData]);
              }
              setHasMore(res.more_posts);
              setPageIndex(currentIndex + limit);
          }
      } catch (error) {
          console.error("Failed to fetch events", error);
      } finally {
          setLoading(false);
          setRefreshing(false);
      }
  }, [pageIndex]);

  const fetchRequests = async () => {
      try {
          const data = await getEventRequests();
          setRequests(data);
      } catch (e) {
          console.error("Failed to fetch requests", e);
      }
  };

  useEffect(() => {
      fetchEvents(true);
      fetchRequests();
  }, []);

  const handleRefresh = () => {
      setRefreshing(true);
      fetchEvents(true);
      fetchRequests();
  };

  const handleLoadMore = () => {
      if (!loading && !refreshing && hasMore) {
          fetchEvents();
      }
  };

  const renderEvent = ({ item }: { item: any }) => {
      const mediaUrl = item.media?.[0]?.media_url;
      const isEnded = (item.luma_event_end_time || item.luma_event_start_time) ? new Date(item.luma_event_end_time || item.luma_event_start_time) < new Date() : false;

      return (
          <View style={[styles.eventCard, { backgroundColor: t.card, borderColor: t.border }]}>
              {mediaUrl && (
                  <View style={styles.imageContainer}>
                      <FastImage source={{ uri: mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      <BlurView blurType="dark" blurAmount={20} style={StyleSheet.absoluteFill} />
                      <FastImage source={{ uri: mediaUrl }} style={styles.eventImage} resizeMode="contain" />
                  </View>
              )}
              
              <View style={styles.eventInfo}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                          {item.luma_event_start_time && (
                              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                                  <Calendar size={16} color="#d8b4fe" style={{ flexShrink: 0, marginTop: 2 }} />
                                  <Text style={{ color: "#d8b4fe", fontSize: 13, fontFamily: "Dank Mono Bold", flexShrink: 1, lineHeight: 20 }}>
                                      {formatEventDate(item.luma_event_start_time)}
                                      {item.luma_event_end_time ? ` → ${formatEventDate(item.luma_event_end_time)}` : ""}
                                  </Text>
                              </View>
                          )}
                      </View>
                      <View style={{ backgroundColor: isEnded ? "rgba(255,255,255,0.1)" : "rgba(5,240,216,0.15)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexShrink: 0 }}>
                          <Text style={{ color: isEnded ? "#999" : "#05f0d8", fontSize: 11, fontFamily: "Dank Mono Bold" }}>
                              {isEnded ? "Ended" : "Active"}
                          </Text>
                      </View>
                  </View>

                  {!!item.about && (
                      <Text style={[styles.eventAbout, { color: t.text }]} numberOfLines={2}>{item.about}</Text>
                  )}

                  {item.luma_event_url && (
                      <TouchableOpacity 
                          onPress={() => Linking.openURL(item.luma_event_url)} 
                          style={styles.eventBtn}
                      >
                          <Link2 size={16} color="#d8b4fe" />
                          <Text style={styles.eventBtnText}>
                              View Event on Luma
                          </Text>
                      </TouchableOpacity>
                  )}

                  {/* Who's going button — only for event owner */}
                  <TouchableOpacity
                      onPress={() => attendeesSheetRef.current?.presentForPost(item.post_id, item.about)}
                      style={[styles.eventBtn, styles.attendeesBtn]}
                  >
                      <Users size={15} color="#c084fc" strokeWidth={1.8} />
                      <Text style={[styles.eventBtnText, { color: "#c084fc" }]}>Who's going</Text>
                  </TouchableOpacity>
              </View>
          </View>
      );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={22} color={t.text} strokeWidth={2} />
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
            <Text style={[styles.headerTitle, { color: t.text }]}>Events</Text>
            {requests.length > 0 && (
                <TouchableOpacity onPress={() => requestsSheetRef.current?.present()} style={{ marginTop: 2 }}>
                    <Text style={{ color: t.accent, fontSize: 12, fontFamily: "Dank Mono Bold" }}>
                        Requests ({pendingCount} pending)
                    </Text>
                </TouchableOpacity>
            )}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => sheetRef.current?.present()}>
            <CalendarPlus size={20} color={t.accent} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {loading && pageIndex === 0 ? (
          <ActivityIndicator size="large" color={t.accent} style={{ marginTop: 40 }} />
      ) : events.length === 0 ? (
          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border, marginHorizontal: 18 }]}>
            <Text style={[styles.emptyTitle, { color: t.text }]}>No events yet</Text>
            <Text style={[styles.emptyDesc, { color: t.muted }]}>
              Your active and past events will appear here.
            </Text>
            <TouchableOpacity
              activeOpacity={0.86}
              onPress={() => sheetRef.current?.present()}
              style={[styles.cta, { backgroundColor: "rgba(168,85,247,0.16)", borderColor: "rgba(168,85,247,0.35)" }]}
            >
              <CalendarPlus size={18} color={t.accent} strokeWidth={1.8} />
              <Text style={[styles.ctaText, { color: t.accent }]}>Create event</Text>
            </TouchableOpacity>
          </View>
      ) : (
          <FlatList
              data={events}
              keyExtractor={(item) => item.post_id.toString()}
              renderItem={renderEvent}
              contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 40 }}
              onRefresh={handleRefresh}
              refreshing={refreshing}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              ListFooterComponent={hasMore ? <ActivityIndicator size="small" color={t.accent} style={{ marginVertical: 20 }} /> : null}
          />
      )}

      <AddLumaEventSheet ref={sheetRef} />
      <EventRequestsSheet ref={requestsSheetRef} requests={requests} onRefresh={fetchRequests} />
      <AttendeesSheet ref={attendeesSheetRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 14,
    paddingHorizontal: 18,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.15)",
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
  eventCard: {
      borderWidth: 1,
      borderRadius: 16,
      marginBottom: 16,
      overflow: "hidden",
  },
  imageContainer: {
      width: "100%",
      height: 180,
      backgroundColor: "#1a1a1a",
  },
  eventImage: {
      width: "100%",
      height: "100%",
  },
  eventInfo: {
      padding: 16,
  },
  eventAbout: {
      fontFamily: "Dank Mono",
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 12,
  },
  eventBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: "rgba(168,85,247,0.2)",
      padding: 12,
      borderRadius: 10,
  },
  eventBtnText: {
      color: "#d8b4fe",
      fontSize: 14,
      fontFamily: "Dank Mono Bold",
  },
  attendeesBtn: {
      marginTop: 8,
      backgroundColor: "rgba(168,85,247,0.1)",
  }
});

