import { useCallback, useState } from "react";
import { addToast } from "@heroui/react";
import { shallow } from "zustand/shallow";
import { useFollowsStore, useSignerStore } from "@/utils/store";

type UseFollowToggleOptions = {
  onRequireSignIn?: () => void;
  onSuccess?: () => void;
};

export function useFollowToggle(
  pubkey: string,
  { onRequireSignIn, onSuccess }: UseFollowToggleOptions = {}
) {
  const { addFollow, removeFollow, directFollowList } = useFollowsStore(
    (state) => ({
      addFollow: state.addFollow,
      removeFollow: state.removeFollow,
      directFollowList: state.directFollowList,
    }),
    shallow
  );
  const isLoggedIn = useSignerStore((state) => state.isLoggedIn);
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
