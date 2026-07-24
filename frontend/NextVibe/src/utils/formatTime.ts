export function parseISOToLocalDate(isoDate: string | null | undefined): Date | null {
  if (!isoDate) return null;
  let str = String(isoDate).trim();
  if (!str) return null;

  if (str.includes(' ') && !str.includes('T')) {
    str = str.replace(' ', 'T');
  }

  const timePart = str.split('T')[1];
  if (timePart && !str.endsWith('Z') && !timePart.includes('+') && !timePart.includes('-')) {
    str = str + 'Z';
  }

  const date = new Date(str);
  return isNaN(date.getTime()) ? new Date(isoDate) : date;
}

export default function timeAgo(timestamp: string | null): string {
  if (!timestamp) return '';

  const date = parseISOToLocalDate(timestamp);
  if (!date || isNaN(date.getTime())) return 'Invalid date';

  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff} seconds ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;

  return `${Math.floor(diff / 31536000)} years ago`;
}
