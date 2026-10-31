package com.rainq.app

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

class PluviaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        if (PluviaConfig.isConfigured && FirebaseApp.getApps(this).isEmpty()) {
            val options = FirebaseOptions.Builder()
                .setApiKey(PluviaConfig.API_KEY)
                .setApplicationId(PluviaConfig.APP_ID)
                .setProjectId(PluviaConfig.PROJECT_ID)
                .setDatabaseUrl(PluviaConfig.DATABASE_URL)
                .build()
            FirebaseApp.initializeApp(this, options)
        }
    }
}
