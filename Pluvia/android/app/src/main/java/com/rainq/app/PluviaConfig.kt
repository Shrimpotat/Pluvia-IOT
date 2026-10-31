package com.rainq.app

/**
 * Firebase settings for the Android app.
 * Fill these in once (steps are in docs/Setup_Guide.md, section 2):
 *
 *  API_KEY      Firebase console > Project settings > General > "Web API Key"
 *  APP_ID       Firebase console > Project settings > General > Your apps > "App ID"
 *               (register an Android app with package name  com.rainq.app  first)
 *  PROJECT_ID   Firebase console > Project settings > General > "Project ID"
 *  DATABASE_URL Firebase console > Realtime Database > the URL at the top of the Data tab
 */
object PluviaConfig {
    const val API_KEY = "AIzaSyA3oKDDtnYp1Jqo8tQX92S6BgnyTwbdyDc"
    const val APP_ID = "1:88394056900:android:229918a72c04d7723c7591"
    const val PROJECT_ID = "pluvia-app"
    const val DATABASE_URL = "https://pluvia-app-default-rtdb.asia-southeast1.firebasedatabase.app"

    /** False until all four values above were replaced. */
    val isConfigured: Boolean
        get() = listOf(API_KEY, APP_ID, PROJECT_ID, DATABASE_URL).none { it.startsWith("PASTE_") }
}
