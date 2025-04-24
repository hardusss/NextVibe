from typing import List, Optional
from ..models import Post, PostsMedia
from django.db.models import Q
from random import shuffle, sample

class Recomendations:
    """
    A class that handles fetching recommendations based on user preferences and popular posts.

    Attributes:
        users (List[int]): A list of user IDs who are requesting recommendations.
    """

    def __init__(self, users: List[int]) -> None:
        """
        Initialize the recommendations with a list of users.

        Args:
            users (List[int]): A list of user IDs for whom to generate recommendations.
        """
        self.users = users
        
    def get_recomendations_posts(self, popular_posts: Optional[List[int]] = None) -> List[dict]:
        """
        Fetches recommended posts based on user IDs and optional popular post filters.

        Args:
            popular_posts (Optional[List[int]]): A list of popular posts IDs to include in recommendations.

        Returns:
            List[dict]: A list of recommended posts with user info.
        """
        base_queryset = Post.objects.select_related("owner").order_by('-create_at')

        if popular_posts:
            posts = base_queryset.filter(
                Q(id__in=popular_posts) | Q(owner__user_id__in=self.users)
            )
        else:
            posts = base_queryset.filter(owner__user_id__in=self.users)

        posts = posts.values(
            "id", "about", "create_at", "location", "count_likes",
            "owner__user_id", "owner__username", "owner__avatar", "owner__official"
        )
        data = []
        for post in posts:
            media = PostsMedia.objects.filter(post_id=post["id"])
            media_data = [{"id": m.id, "media_url": str(m.file)} for m in media] if media.exists() else None
            
            data.append({
                "owner__user_id": post["owner__user_id"],
                "owner__username": post["owner__username"],
                "owner__avatar": str(post["owner__avatar"]),
                "owner__official": post["owner__official"],
                "id": post["id"],
                "about": post["about"],
                "location": post["location"],
                "count_likes": post["count_likes"],
                "media": media_data,
                "create_at": post["create_at"],
            })
        return sample(data, min(len(posts), 6))  

    

class RecomendationsFormater:
    """
    A class that prepares the data for generating recommendations based on various user activities.

    Attributes:
        __last_search_history (List[int]): A list of post IDs from the user's search history.
        __last_likes (List[int]): A list of post IDs from the user's liked posts.
        __last_follows (List[int]): A list of user IDs that the user has followed.
        __last_checked_profiles (List[int]): A list of user profiles the user has recently viewed.
    """

    def __init__(self,
                last_search_history: List[int],
                last_likes: List[int],
                last_follows: List[int],
                last_checked_profiles: List[int]) -> None:
        """
        Initialize the formater with the user's activity data.

        Args:
            last_search_history (List[int]): A list of post IDs from the user's search history.
            last_likes (List[int]): A list of post IDs from the user's liked posts.
            last_follows (List[int]): A list of user IDs that the user has followed.
            last_checked_profiles (List[int]): A list of user profiles the user has recently viewed.
        """
        # Store the user activity data
        self.__last_search_history = last_search_history
        self.__last_likes = last_likes
        self.__last_follows = last_follows
        self.__last_checked_profiles = last_checked_profiles
        
        # Get popular posts with more than 1000 likes
        self.__popular_posts = Post.objects.filter(count_likes__gt=1000).values("id")
        
        # Get posts by popular users (those with more than 50,000 readers or official accounts)
        self.__posts_by_popular_users = Post.objects.filter(
            Q(owner__readers_count__gt=50_000) | Q(owner__official=True)
        ).values("id")

    def format(self) -> List[int]:
        global_users = self.__last_search_history + self.__last_likes + self.__last_follows + self.__last_checked_profiles
        shuffle(global_users)  # Randomly shuffle the user data
        
        # Combine popular posts and posts by popular users, but pass only the IDs
        all_posts = [post["id"] for post in self.__popular_posts] + [post["id"] for post in self.__posts_by_popular_users]
        
        # Return the final recommendations based on shuffled user data and popular posts
        return Recomendations(global_users).get_recomendations_posts(all_posts)

