//@ts-ignore
import Logo from "data-url:./images/icon.png"

import { Storage } from "@plasmohq/storage"

import {
  type PlatformResponse,
  type PlatformStream,
  type UserTwitchKey
} from "./lib/types/twitchTypes"
import {
  getTwitchOAuthURL,
  getTwitchStreamer,
  getTwitchUserId,
  twitchFetcher
} from "./lib/util/fetcher"
import {
  createNotification,
  createNotificationMultipleStreams,
  justWentLive,
  parseKickObject
} from "./lib/util/helperFunc"

chrome.alarms.onAlarm.addListener(() => {
  refresh()
})

const storage = new Storage()
const storageLocal = new Storage({
  area: "local"
})

storage.watch({
  userTwitchKey: (c) => {
    if (c.newValue !== undefined) refresh()
  }
})

chrome.runtime.onStartup.addListener(() => {
  storageLocal.remove("followedLive")

  refresh()
})

chrome.runtime.onInstalled.addListener(() => {
  storageLocal.remove("followedLive")

  refresh()
})

const refresh = async () => {
  try {
    console.log("refresh alarm created")
    chrome.alarms.create("refresh", {
      delayInMinutes: 4
    })
    const followedLive =
      await storageLocal.get<PlatformResponse<PlatformStream>>("followedLive")
    const userTwitchKey = await storage.get<UserTwitchKey>("userTwitchKey")
    const kickFollows = await storage.get<string[]>("kickFollows")
    const notificationsEnabled = await storage.get<boolean>(
      "notificationsEnabled"
    )

    if (!userTwitchKey && kickFollows?.length === 0) {
      console.log("No userTwitchKey or kickFollows found")
      return
    }

    let refreshedLive: PlatformResponse<PlatformStream> = {
      data: [],
      pagination: {
        cursor: null
      },
      platform: "twitch"
    }
    if (userTwitchKey) {
      refreshedLive = (await twitchFetcher([
        `https://api.twitch.tv/helix/streams/followed?user_id=${userTwitchKey?.user_id}`,
        userTwitchKey
      ])) as PlatformResponse<PlatformStream>
    }

    let kickLivestreams = []
    if (kickFollows && kickFollows.length > 0) {
      try {
        const streamersQuery = kickFollows.join(",")
        const kickStreamsResponse = await fetch(
          `https://kitch.pl/api/v2/channels?streamers=${streamersQuery}`
        )
        const kickStreamsJson = await kickStreamsResponse.json()

        for (const streamer of kickFollows) {
          const kickStreamJson = kickStreamsJson[streamer.toLowerCase()]
          if (kickStreamJson.error || kickStreamJson.livestream === null)
            continue

          kickLivestreams.push(parseKickObject(kickStreamJson, streamer))
        }
      } catch (error) {
        console.error("Error fetching kick streams:", error)
      }
    }

    refreshedLive.data = [...refreshedLive.data, ...kickLivestreams]
    // sort by viewer count
    refreshedLive.data.sort((a, b) => b.viewer_count - a.viewer_count)

    await storageLocal.set("followedLive", refreshedLive)
    chrome.action.setBadgeText({ text: refreshedLive.data.length.toString() })
    chrome.action.setBadgeBackgroundColor({ color: "#737373" })
    if (!followedLive) {
      return
    }

    const newLiveChannels = await justWentLive(
      followedLive.data,
      refreshedLive.data
    )

    if (!notificationsEnabled || newLiveChannels.length <= 0) {
      return
    }
    if (newLiveChannels.length == 1) {
      const liveChannel = newLiveChannels[0]

      if (liveChannel?.platform === "Kick") {
        createNotification(liveChannel, Logo)
      } else {
        const { profile_image_url } = await getTwitchStreamer(
          userTwitchKey,
          liveChannel.user_id
        )
        createNotification(liveChannel, profile_image_url)
      }
    }
    if (newLiveChannels.length > 1) {
      createNotificationMultipleStreams(newLiveChannels, Logo)
    }
  } catch (error) {
    console.error("Error fetching Twitch data:", error)
    if (error.status === 401 || error.message.includes("not iterable")) {
      const storage = new Storage()
      storage.remove("userTwitchKey")
      storage.remove("followedLive")
    }
  }
}

// Nasłuchiwanie na aktualizacje zakładek
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url?.startsWith("https://kitch.pl/")
  ) {
    try {
      await authorize(tab.url)
      // Zamknij zakładkę po autoryzacji
    } catch (e) {
      console.error("Błąd podczas autoryzacji:", e)
      await storage.set("authLoading", false)
    }
  }
})

// on message do authorization
chrome.runtime.onMessage.addListener(async (request) => {
  if (request.type === "authorize") {
    try {
      await storage.set("authLoading", true)
      const authUrl = getTwitchOAuthURL()
      // Otwórz nową zakładkę z URL autoryzacji
      chrome.tabs.create({ url: authUrl })
    } catch (e) {
      console.error("Błąd podczas autoryzacji:", e)
      await storage.set("authLoading", false)
    }
  } else if (request.type === "refresh") {
    refresh()
  } else if (request.type === "logout") {
    const storage = new Storage()
    await storage.remove("userTwitchKey")
    await storage.remove("followedLive")
    await storage.remove("authLoading")
    refresh()
  }
})

async function authorize(redirectUrl) {
  try {
    const urlObject = new URL(redirectUrl)
    const fragment = urlObject.hash.substring(1)
    const accessToken = new URLSearchParams(fragment).get("access_token")

    if (!accessToken) {
      throw new Error("Nie udało się uzyskać tokena dostępu")
    }

    const clientId = "256lknox4x75bj30rwpctxna2ckbmn"
    const userCredentials = {
      user_id: await getTwitchUserId({
        access_token: accessToken,
        client_id: clientId
      }),
      access_token: accessToken,
      client_id: clientId
    }

    const storage = new Storage()
    await storage.set("userTwitchKey", userCredentials)
    await storage.set("authLoading", false)
  } catch (e) {
    console.error("Błąd autoryzacji:", e)
    const storage = new Storage()
    await storage.set("authLoading", false)
  }
}
