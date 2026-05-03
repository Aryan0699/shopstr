import { useCallback, useState } from "react";
import { addToast } from "@heroui/react";
import { useAuthStore } from "@/utils/stores/auth-store";
import { useSocialStore } from "@/utils/stores/social-store";

type UseFollowToggleOptions = {
  onRequireSignIn?: () => void;
  onSuccess?: () => void;
};

export function useFollowToggle(
  pubkey: string,
  { onRequireSignIn, onSuccess }: UseFollowToggleOptions = {}
) {
  const addFollow = useSocialStore((state) => state.addFollow);
  const removeFollow = useSocialStore((state) => state.removeFollow);
  const directFollowList = useSocialStore((state) => state.directFollowList);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const [isLoading, setIsLoading] = useState(false);
  const isFollowing = directFollowList.includes(pubkey);

  const toggle = useCallback(async (): Promise<boolean> => {
    if (!pubkey) return false;

    if (!isLoggedIn) {
      onRequireSignIn?.();
      return false;
    }

    setIsLoading(true);
    try {
      const success = isFollowing
        ? await removeFollow(pubkey)
        : await addFollow(pubkey);

      if (success) {
        addToast({
          title: isFollowing ? "Unfollowed merchant" : "Following",
          color: isFollowing ? "default" : "success",
        });
        onSuccess?.();
      }

      return success;
    } catch (error) {
      console.error("Follow action failed:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [
    addFollow,
    removeFollow,
    isFollowing,
    isLoggedIn,
    onRequireSignIn,
    onSuccess,
    pubkey,
  ]);

  return {
    isFollowing,
    isLoading,
    toggle,
  };
}
