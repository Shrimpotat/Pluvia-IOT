package com.rainq.app

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.DatabaseReference
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ValueEventListener
import com.rainq.app.auth.LoginActivity
import com.rainq.app.databinding.ActivityMainBinding
import com.rainq.app.model.CoverStatus
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Pluvia dashboard (FRS 1.1 #8-#9): shows the live cover and rain status from Firebase
 * and lets the user open or close the cover manually.
 */
class MainActivity : AppCompatActivity() {

    /** A device that has not reported for this long is treated as offline. */
    private val deviceTimeoutMs = 45_000L

    private lateinit var b: ActivityMainBinding
    private lateinit var statusRef: DatabaseReference
    private lateinit var connectedRef: DatabaseReference
    private lateinit var lastSeenRef: DatabaseReference

    private var ready = false
    private var isOnline = false
    private var deviceSeenAt = 0L

    private val statusListener = object : ValueEventListener {
        override fun onDataChange(snapshot: DataSnapshot) {
            render(CoverStatus.from(snapshot))
        }

        override fun onCancelled(error: DatabaseError) {
            showMessage("Cannot read the cover status: ${error.message}")
        }
    }

    private val connectedListener = object : ValueEventListener {
        override fun onDataChange(snapshot: DataSnapshot) {
            isOnline = snapshot.value as? Boolean ?: false
            renderConnection()
        }

        override fun onCancelled(error: DatabaseError) {}
    }

    // The device heartbeat. Without it the app cannot tell "the phone is online"
    // from "the umbrella is actually still reporting".
    private val lastSeenListener = object : ValueEventListener {
        override fun onDataChange(snapshot: DataSnapshot) {
            deviceSeenAt = (snapshot.value as? Number)?.toLong() ?: 0L
            renderConnection()
        }

        override fun onCancelled(error: DatabaseError) {}
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // No Firebase setup or no logged-in user -> back to login.
        val user = if (PluviaConfig.isConfigured) FirebaseAuth.getInstance().currentUser else null
        if (user == null) {
            goToLogin()
            return
        }

        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)

        // Blue status bar with light icons to match the header.
        window.statusBarColor = ContextCompat.getColor(this, R.color.rainq_primary)
        WindowCompat.getInsetsController(window, b.root).isAppearanceLightStatusBars = false

        val database = FirebaseDatabase.getInstance()
        statusRef = database.getReference("umbrellaCover")
        connectedRef = database.getReference(".info/connected")
        lastSeenRef = database.getReference("device/lastSeen")

        val email = user.email ?: ""
        bindProfile(user.displayName ?: "", email, "")
        database.getReference("users").child(user.uid).get().addOnSuccessListener { snap ->
            val name = snap.child("name").value as? String ?: ""
            val phone = snap.child("phone").value as? String ?: ""
            bindProfile(name, email, phone)
        }

        b.btnOpen.setOnClickListener { sendCommand("OPEN", "Open") }
        b.btnClose.setOnClickListener { sendCommand("CLOSE", "Close") }

// Change these two lines to write directly to controlMode
        b.btnModeAuto.setOnClickListener {
            statusRef.child("controlMode").setValue("AUTO")
                .addOnSuccessListener { showMessage("Automatic mode selected") }
        }
        b.btnModeManual.setOnClickListener {
            statusRef.child("controlMode").setValue("MANUAL")
                .addOnSuccessListener { showMessage("Manual mode selected") }
        }
        b.btnLogout.setOnClickListener {
            MaterialAlertDialogBuilder(this)
                .setTitle("Log out")
                .setMessage("Are you sure you want to log out?")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Log out") { _, _ ->
                    FirebaseAuth.getInstance().signOut()
                    goToLogin()
                }
                .show()
        }

        render(null)
        ready = true
    }

    // Listen for live updates only while the screen is visible.
    override fun onStart() {
        super.onStart()
        if (!ready) return
        statusRef.addValueEventListener(statusListener)
        connectedRef.addValueEventListener(connectedListener)
        lastSeenRef.addValueEventListener(lastSeenListener)
    }

    override fun onStop() {
        super.onStop()
        if (!ready) return
        statusRef.removeEventListener(statusListener)
        connectedRef.removeEventListener(connectedListener)
        lastSeenRef.removeEventListener(lastSeenListener)
    }

    // ---------------------------------------------------------------- commands

    private fun sendCommand(command: String, label: String) {
        if (!isOnline) {
            showMessage("You are offline. Reconnect to control the cover.")
            return
        }
        statusRef.child("command").setValue(command)
            .addOnSuccessListener { showMessage("$label command sent") }
            .addOnFailureListener { e -> showMessage("Could not send the command: ${e.localizedMessage}") }
    }

    // ---------------------------------------------------------------- display

    /**
     * Two different things are shown here: whether the phone is talking to
     * Firebase, and whether the device itself is still reporting. A device that
     * is powered off looks exactly like a quiet one until we time its heartbeat.
     */
    private fun renderConnection() {
        if (!::b.isInitialized) return

        val deviceOnline = deviceSeenAt > 0L && System.currentTimeMillis() - deviceSeenAt < deviceTimeoutMs
        b.tvConnection.text = when {
            !isOnline -> "\u25CF No connection"
            deviceOnline -> "\u25CF Live"
            else -> "\u25CF Device offline"
        }
        b.tvConnection.setTextColor(
            color(if (isOnline && deviceOnline) R.color.pluvia_open else R.color.pluvia_offline))
    }

    private fun render(status: CoverStatus?) {
        if (status == null) {
            b.tvCoverIcon.text = "\u2602\uFE0F"
            b.tvCoverStatus.text = "No data"
            b.tvCoverStatus.setTextColor(color(R.color.pluvia_closed))
            b.tvRainStatus.text = "-"
            b.toggleMode.check(b.btnModeAuto.id)
            b.tvUpdated.text = "-"
            b.tvSensor.text = "-"
            b.tvPending.text = "Waiting for the first status from the device. " +
                "Check that it is powered on and connected to Wi-Fi, " +
                "or run the simulator in firmware/simulator if there is no hardware yet."
            b.tvPending.visibility = View.VISIBLE
            renderConnection()
            return
        }

        val open = status.isOpen
        b.tvCoverIcon.text = if (open) "\u2602\uFE0F" else "\uD83D\uDCE6"
        b.tvCoverStatus.text = if (open) "OPEN" else "CLOSED"
        b.tvCoverStatus.setTextColor(color(if (open) R.color.pluvia_open else R.color.pluvia_closed))

        val raining = status.isRaining
        b.tvRainStatus.text = if (raining) "\uD83C\uDF27\uFE0F Rain Detected" else "\u2600\uFE0F No Rain"
        b.tvRainStatus.setTextColor(color(if (raining) R.color.pluvia_rain else R.color.pluvia_dry))

        b.toggleMode.check(if (status.isManual) b.btnModeManual.id else b.btnModeAuto.id)
        b.tvUpdated.text = formatUpdated(status.updatedAt)
        b.tvSensor.text = status.rainLevel?.let { "$it (0-4095)" } ?: "Not reported yet"

        if (status.commandPending) {
            b.tvPending.text = "Command sent. Waiting for the device..."
            b.tvPending.visibility = View.VISIBLE
        } else {
            b.tvPending.visibility = View.GONE
        }
    }

    private fun bindProfile(name: String, email: String, phone: String) {
        val firstName = name.trim().split(Regex("\\s+")).firstOrNull { it.isNotEmpty() }

        b.tvAvatar.text = initials(name, email)
        b.tvGreeting.text = greeting()
        b.tvName.text = firstName ?: email
        b.tvDate.text = SimpleDateFormat("EEEE, MMMM d, yyyy", Locale.getDefault()).format(Date())

        b.tvInfoName.text = name.ifBlank { "Not provided" }
        b.tvInfoEmail.text = email
        b.tvInfoPhone.text = phone.ifBlank { "Not provided" }
    }

    private fun formatUpdated(timestamp: Long?): String {
        if (timestamp == null || timestamp <= 0L) return "Not reported yet"
        return SimpleDateFormat("MMM d, h:mm a", Locale.getDefault()).format(Date(timestamp))
    }

    private fun greeting(): String {
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        return when {
            hour < 12 -> "Good morning,"
            hour < 18 -> "Good afternoon,"
            else -> "Good evening,"
        }
    }

    private fun initials(name: String, email: String): String {
        val parts = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        val letters = when {
            parts.size >= 2 -> "${parts.first().first()}${parts.last().first()}"
            parts.size == 1 -> parts.first().first().toString()
            else -> email.take(1)
        }
        return letters.uppercase()
    }

    private fun color(resId: Int): Int = ContextCompat.getColor(this, resId)

    private fun showMessage(text: String) {
        Snackbar.make(b.root, text, Snackbar.LENGTH_LONG).show()
    }

    private fun goToLogin() {
        startActivity(
            Intent(this, LoginActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        )
        finish()
    }
}
