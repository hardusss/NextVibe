import { FlatList } from "react-native";

/**
 * Module-level ref for the Home feed FlatList.
 * Lives in a separate util to avoid circular dependencies
 * between _layout.tsx and MainPage.tsx.
 */
let feedFlatListRef: FlatList | null = null;

export const setFeedFlatListRef = (ref: FlatList | null) => {
    feedFlatListRef = ref;
};

export const scrollFeedToTop = () => {
    feedFlatListRef?.scrollToOffset({ offset: 0, animated: true });
};
