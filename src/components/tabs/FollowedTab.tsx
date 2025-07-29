import { IconLoader2 } from "@tabler/icons-react"
import { useAtom } from "jotai"
import React from "react"

import { Storage } from "@plasmohq/storage"
import { useStorage } from "@plasmohq/storage/hook"

import {
  currentTabAtom,
  followedLiveFilterAtom,
  searchQueryAtom
} from "~src/lib/util"
import { sendRuntimeMessage } from "~src/lib/util/helperFunc"

import type { PlatformStream } from "../../lib/types/twitchTypes"
import StreamItem from "../StreamItem"
import { Button } from "../ui/button"
import { kickMenuAtom } from "./OptionsTab"

const FollowedTab = () => {
  const [searchQuery] = useAtom(searchQueryAtom)
  const [followedLiveFilter] = useAtom(followedLiveFilterAtom)
  const [, setCurrentTab] = useAtom(currentTabAtom)
  const [, setKickMenu] = useAtom(kickMenuAtom)
  const [followedLive] = useStorage({
    key: "followedLive",
    instance: new Storage({ area: "local" })
  })
  const [userTwitchKey, , { isLoading: twitchKeyLoading }] =
    useStorage("userTwitchKey")
  const [kickFollows, , { isLoading: kickFollowsLoading }] =
    useStorage<string[]>("kickFollows")

  const filteredStreams = followedLive?.data?.filter((stream) => {
    const matchesSearch = stream.user_name
      .toLowerCase()
      .includes(searchQuery.toLowerCase())

    if (followedLiveFilter === "All") {
      return matchesSearch
    }
    if (followedLiveFilter === "Kick") {
      return stream.platform === "Kick" && matchesSearch
    } else {
      return (
        (stream.platform === "Twitch" || stream.platform === undefined) &&
        matchesSearch
      )
    }
  })

  const storageLoading = twitchKeyLoading || kickFollowsLoading
  const hasAnyPlatforms =
    userTwitchKey || (kickFollows && kickFollows.length > 0)

  if (followedLive?.length === 0 || storageLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <IconLoader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <>
      {(filteredStreams?.length === 0 || filteredStreams === undefined) && (
        <div className="flex flex-col gap-4 justify-center items-center h-full px-6">
          {!hasAnyPlatforms ? (
            <>
              <div className="text-center">
                <h3 className="text-white text-lg font-semibold mb-2">
                  Welcome to Kitch!
                </h3>
                <p className="text-gray-300 text-sm mb-4">
                  Get started by connecting your streaming platforms to see your
                  followed channels
                </p>
              </div>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <Button
                  className="w-full rounded-md border-0 hover:bg-purple-800 bg-purple-700 text-white"
                  onClick={() => sendRuntimeMessage("authorize")}>
                  Connect Twitch Account
                </Button>
                <Button
                  className="w-full rounded-md border-0 hover:bg-green-800 bg-green-700 text-white"
                  onClick={() => {
                    setCurrentTab("options")
                    setKickMenu(true)
                  }}>
                  Add Kick Streamers
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center">
              <p className="text-white mb-2">No streams found</p>
              <p className="text-gray-400">
                {!userTwitchKey && kickFollows?.length > 0
                  ? "Connect Twitch account to see more streams"
                  : userTwitchKey && (!kickFollows || kickFollows.length === 0)
                    ? "Add Kick streamers to see more content"
                    : "Your followed streamers are currently offline"}
              </p>
            </div>
          )}
        </div>
      )}
      {filteredStreams?.map((stream: PlatformStream) =>
        stream?.platform === "Kick" ? (
          <StreamItem variant="Kick" stream={stream} key={stream.id} />
        ) : (
          <StreamItem stream={stream} key={stream.id} />
        )
      )}
    </>
  )
}

export default FollowedTab
