// CoverStatus.kt
package com.rainq.app.model

import com.google.firebase.database.DataSnapshot

/** The /umbrellaCover node written by the ESP32 (see FRS 1.3, Database). */
data class CoverStatus(
    val rainStatus: String?,    // RAIN or NO_RAIN
    val coverStatus: String?,   // OPEN or CLOSED
    val controlMode: String?,   // AUTO or MANUAL
    val command: String?,       // OPEN, CLOSE or NONE
    val updatedAt: Long?,       // server timestamp (ms) of the last change
    val rainLevel: Int?         // averaged sensor reading (0-4095), for calibration
) {
    val isRaining: Boolean get() = rainStatus == "RAIN"
    val isOpen: Boolean get() = coverStatus == "OPEN"
    val isManual: Boolean get() = controlMode == "MANUAL"
    val commandPending: Boolean get() = command == "OPEN" || command == "CLOSE"

    companion object {
        /** Returns null when the node does not exist yet. */
        fun from(snapshot: DataSnapshot): CoverStatus? {
            if (!snapshot.exists()) return null
            return CoverStatus(
                rainStatus = snapshot.child("rainStatus").value as? String,
                coverStatus = snapshot.child("coverStatus").value as? String,
                controlMode = snapshot.child("controlMode").value as? String,
                command = snapshot.child("command").value as? String,
                updatedAt = (snapshot.child("updatedAt").value as? Number)?.toLong(),
                rainLevel = (snapshot.child("rainLevel").value as? Number)?.toInt()
            )
        }
    }
}