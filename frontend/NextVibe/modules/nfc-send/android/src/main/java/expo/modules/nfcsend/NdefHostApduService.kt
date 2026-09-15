package expo.modules.nfcsend

import android.nfc.cardemulation.HostApduService
import android.os.Bundle
import java.io.ByteArrayOutputStream

/**
 * Emulates an NFC Forum Type 4 tag holding one URI record, so any phone that
 * reads NDEF (iPhone background tag reading, Android's tag dispatcher) opens
 * the shared link.
 *
 * Commands are parsed by instruction rather than matched byte-for-byte:
 * readers differ in whether they send Le on SELECT and how much they read at
 * once.
 */
class NdefHostApduService : HostApduService() {

    companion object {
        @Volatile var urlToShare: String = ""
        @Volatile var isSharing: Boolean = false
        @Volatile var onReadListener: (() -> Unit)? = null

        private val NDEF_AID = byteArrayOf(
            0xD2.toByte(), 0x76, 0x00, 0x00, 0x85.toByte(), 0x01, 0x01
        )
        private const val CC_FILE_ID = 0xE103
        private const val NDEF_FILE_ID = 0xE104
        private const val MAX_NDEF_FILE_SIZE = 0x0400

        private val SW_OK = byteArrayOf(0x90.toByte(), 0x00)
        private val SW_FILE_NOT_FOUND = byteArrayOf(0x6A, 0x82.toByte())
        private val SW_WRONG_LENGTH = byteArrayOf(0x67, 0x00)
        private val SW_WRONG_OFFSET = byteArrayOf(0x6B, 0x00)
        private val SW_INS_NOT_SUPPORTED = byteArrayOf(0x6D, 0x00)

        // NFC Forum URI identifier codes, longest prefix first.
        private val URI_PREFIXES = listOf(
            "https://www." to 0x02,
            "http://www." to 0x01,
            "https://" to 0x04,
            "http://" to 0x03
        )
    }

    private enum class Selection { NONE, APPLICATION, CAPABILITY_CONTAINER, NDEF_FILE }

    private var selection = Selection.NONE
    private var ndefFile = ByteArray(0)
    private var readNotified = false

    override fun processCommandApdu(commandApdu: ByteArray, extras: Bundle?): ByteArray {
        if (commandApdu.size < 4) return SW_WRONG_LENGTH
        val ins = commandApdu[1].toInt() and 0xFF
        val p1 = commandApdu[2].toInt() and 0xFF
        val p2 = commandApdu[3].toInt() and 0xFF
        return when (ins) {
            0xA4 -> handleSelect(commandApdu, p1)
            0xB0 -> handleReadBinary(commandApdu, p1, p2)
            else -> SW_INS_NOT_SUPPORTED
        }
    }

    private fun handleSelect(apdu: ByteArray, p1: Int): ByteArray {
        if (apdu.size < 5) return SW_WRONG_LENGTH
        val lc = apdu[4].toInt() and 0xFF
        if (apdu.size < 5 + lc) return SW_WRONG_LENGTH
        val data = apdu.copyOfRange(5, 5 + lc)

        // SELECT by AID
        if (p1 == 0x04) {
            val url = urlToShare
            if (!data.contentEquals(NDEF_AID) || !isSharing || url.isEmpty()) {
                selection = Selection.NONE
                return SW_FILE_NOT_FOUND
            }
            selection = Selection.APPLICATION
            ndefFile = buildNdefFile(url)
            readNotified = false
            return SW_OK
        }

        // SELECT by file identifier (only after the application is selected)
        if (p1 == 0x00 && lc == 2 && selection != Selection.NONE) {
            val fileId = ((data[0].toInt() and 0xFF) shl 8) or (data[1].toInt() and 0xFF)
            return when (fileId) {
                CC_FILE_ID -> {
                    selection = Selection.CAPABILITY_CONTAINER
                    SW_OK
                }
                NDEF_FILE_ID -> {
                    selection = Selection.NDEF_FILE
                    SW_OK
                }
                else -> SW_FILE_NOT_FOUND
            }
        }
        return SW_FILE_NOT_FOUND
    }

    private fun handleReadBinary(apdu: ByteArray, p1: Int, p2: Int): ByteArray {
        val file = when (selection) {
            Selection.CAPABILITY_CONTAINER -> capabilityContainer()
            Selection.NDEF_FILE -> ndefFile
            else -> return SW_FILE_NOT_FOUND
        }
        val offset = ((p1 and 0x7F) shl 8) or p2
        // Le absent or 0 means "as much as fits" (255 for short APDUs).
        val le = if (apdu.size >= 5) (apdu[4].toInt() and 0xFF).let { if (it == 0) 255 else it } else 255
        if (offset > file.size) return SW_WRONG_OFFSET
        val end = minOf(file.size, offset + le)
        val chunk = file.copyOfRange(offset, end)

        // The body (past the 2-byte length) has been read — that's a tap.
        if (selection == Selection.NDEF_FILE && end > 2 && !readNotified) {
            readNotified = true
            onReadListener?.invoke()
        }
        return chunk + SW_OK
    }

    private fun capabilityContainer(): ByteArray = byteArrayOf(
        0x00, 0x0F,                         // CCLEN
        0x20,                               // mapping version 2.0
        0x00, 0x3B,                         // MLe (max read size)
        0x00, 0x34,                         // MLc (max write size)
        0x04, 0x06,                         // NDEF file control TLV
        0xE1.toByte(), 0x04,                // NDEF file id
        (MAX_NDEF_FILE_SIZE shr 8).toByte(), (MAX_NDEF_FILE_SIZE and 0xFF).toByte(),
        0x00,                               // read access: open
        0xFF.toByte()                       // write access: none
    )

    /** NLEN (2 bytes) + a single well-known URI record. */
    private fun buildNdefFile(url: String): ByteArray {
        var prefixCode = 0x00
        var rest = url
        for ((prefix, code) in URI_PREFIXES) {
            if (url.startsWith(prefix)) {
                prefixCode = code
                rest = url.substring(prefix.length)
                break
            }
        }
        val body = rest.toByteArray(Charsets.UTF_8)
        val payloadLength = body.size + 1
        val shortRecord = payloadLength <= 0xFF

        val record = ByteArrayOutputStream()
        // MB | ME | (SR) | TNF=well-known
        record.write(0x80 or 0x40 or (if (shortRecord) 0x10 else 0x00) or 0x01)
        record.write(0x01) // type length
        if (shortRecord) {
            record.write(payloadLength)
        } else {
            record.write((payloadLength ushr 24) and 0xFF)
            record.write((payloadLength ushr 16) and 0xFF)
            record.write((payloadLength ushr 8) and 0xFF)
            record.write(payloadLength and 0xFF)
        }
        record.write(0x55) // type "U"
        record.write(prefixCode)
        record.write(body)
        val message = record.toByteArray()

        val file = ByteArray(message.size + 2)
        file[0] = ((message.size shr 8) and 0xFF).toByte()
        file[1] = (message.size and 0xFF).toByte()
        System.arraycopy(message, 0, file, 2, message.size)
        return file
    }

    override fun onDeactivated(reason: Int) {
        selection = Selection.NONE
        readNotified = false
    }
}
