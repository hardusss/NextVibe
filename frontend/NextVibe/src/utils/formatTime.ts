const timeAgo = (timestamp: string | number): string => {
    const now = Date.now();
    let time: number;

    if (typeof timestamp === "string") {
        const parsedTime = Date.parse(timestamp);
        if (isNaN(parsedTime)) return "Invalid date"; // Перевірка, щоб уникнути NaN
        time = parsedTime;
    } else {
        time = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    }

    const diff = Math.floor((now - time) / 1000);

    if (diff < 60) return `${diff} seconds ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;

    return `${Math.floor(diff / 31536000)} years ago`;
};

export default timeAgo;
