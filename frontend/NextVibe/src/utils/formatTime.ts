export default function timeAgo(timestamp: string | null): string {
    if (!timestamp) return '';
    // Convert timestamp to Date object
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "Invalid date";
      // Calculate time difference in seconds
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    // Return appropriate time difference string
    if (diff < 5) return "just now";
    if (diff < 60) return `${diff} seconds ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;

    return `${Math.floor(diff / 31536000)} years ago`;
}
