package com.addressiq.location

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.ReactApplicationContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The React Native collector, on a device.
 *
 * This SDK's device intelligence had never been exercised anywhere: the only
 * checks on it read the source, or grepped the built APK for strings. Neither
 * establishes that the platform answers. The native Android SDK carries the
 * same emulator logic and was proven separately, but this is a second copy —
 * "the other one works" is not evidence about this one, and copies drift.
 *
 * The failure this guards against is specific and has happened twice already in
 * this codebase: a detector returning `false` because it could not look, which
 * the engine reads as a clean device.
 */
@RunWith(AndroidJUnit4::class)
class DeviceSignalsInstrumentedTest {

    private val module by lazy {
        AddressIQLocationModule(
            ReactApplicationContext(InstrumentationRegistry.getInstrumentation().targetContext),
        )
    }

    @Test
    fun theEmulatorItIsRunningOnIsRecognised() {
        // The widely-copied Build-property heuristic does NOT match a current
        // AVD — `google/sdk_gphone16k_arm64/…/dev-keys` trips none of its
        // predicates — which is why the native SDK's EMULATOR_DETECTED never
        // fired. This copy leads with ro.hardware and the qemu flags instead;
        // that is what this asserts.
        assertTrue(
            "isProbablyEmulator() returned false on an emulator — " +
                "EMULATOR_DETECTED is unreachable from React Native",
            module.isProbablyEmulator(),
        )
    }

    @Test
    fun theQemuMarkersAreActuallyReadable() {
        // SystemProperties is hidden API reached by reflection. If that ever
        // stops working it returns "" and the emulator check silently falls
        // back to the predicates that do not match — passing, but blind.
        val hardware = module.systemProperty("ro.hardware")
        assertTrue(
            "ro.hardware came back empty — the reflective read is broken and " +
                "detection has silently fallen back to the Build properties",
            hardware.isNotEmpty(),
        )
        assertEquals("ranchu", hardware)
    }

    @Test
    fun rootDetectionDoesNotFireOnACleanDevice() {
        // The firing path needs a rooted device and cannot be reached here; the
        // native SDK makes its markers injectable for that reason. What is
        // testable is the absence of a false positive, which for a fraud signal
        // is the more damaging direction.
        assertFalse(
            "isProbablyRooted fired on a stock emulator — honest devices would be flagged",
            module.isProbablyRooted(),
        )
    }

    @Test
    fun theInstallIdIsMintedOnceAndReused() {
        val first = module.installId()
        val second = module.installId()
        assertTrue("installId is empty", first.isNotEmpty())
        assertEquals(
            "installId is not stable — DEVICE_CHANGE would fire on every verification",
            first,
            second,
        )
    }
}
