package expo.modules.nfcsend

import android.nfc.cardemulation.HostApduService
import android.os.Bundle
import java.util.Arrays

class NdefHostApduService : HostApduService() {

    companion object {
        var urlToShare: String = "https://nextvibe.io"
    }

    // Commands for read nfc
    private val APDU_SELECT = byteArrayOf(0x00.toByte(), 0xA4.toByte(), 0x04.toByte(), 0x00.toByte(), 0x07.toByte(), 0xD2.toByte(), 0x76.toByte(), 0x00.toByte(), 0x00.toByte(), 0x85.toByte(), 0x01.toByte(), 0x01.toByte(), 0x00.toByte())
    private val CAPABILITY_CONTAINER_OK = byteArrayOf(0x00.toByte(), 0xA4.toByte(), 0x00.toByte(), 0x0C.toByte(), 0x02.toByte(), 0xE1.toByte(), 0x03.toByte())
    private val READ_CAPABILITY_CONTAINER = byteArrayOf(0x00.toByte(), 0xB0.toByte(), 0x00.toByte(), 0x00.toByte(), 0x0F.toByte())
    private val NDEF_SELECT_OK = byteArrayOf(0x00.toByte(), 0xA4.toByte(), 0x00.toByte(), 0x0C.toByte(), 0x02.toByte(), 0xE1.toByte(), 0x04.toByte())
    private val NDEF_READ_BINARY = byteArrayOf(0x00.toByte(), 0xB0.toByte())
    
    private val RESP_OK = byteArrayOf(0x90.toByte(), 0x00.toByte())
    private val RESP_FAIL = byteArrayOf(0x6A.toByte(), 0x82.toByte())

    private var appSelected = false; private var ccSelected = false; private var ndefSelected = false

    override fun processCommandApdu(commandApdu: ByteArray, extras: Bundle?): ByteArray {
        if (Arrays.equals(APDU_SELECT, commandApdu)) { appSelected = true; ccSelected = false; ndefSelected = false; return RESP_OK }
        if (Arrays.equals(CAPABILITY_CONTAINER_OK, commandApdu)) { if (appSelected) ccSelected = true; return RESP_OK }
        
        if (Arrays.equals(READ_CAPABILITY_CONTAINER, commandApdu) && ccSelected) {
            val ccFile = byteArrayOf(0x00, 0x0F, 0x20, 0x00, 0x3B, 0x00, 0x34, 0x04, 0x06, 0xE1.toByte(), 0x04.toByte(), 0x00, 0xFF.toByte(), 0x00, 0xFF.toByte())
            return ccFile + RESP_OK
        }
        
        if (Arrays.equals(NDEF_SELECT_OK, commandApdu)) { if (appSelected) ndefSelected = true; return RESP_OK }

        if (commandApdu.size >= 2 && commandApdu[0] == NDEF_READ_BINARY[0] && commandApdu[1] == NDEF_READ_BINARY[1] && ndefSelected) {
            val offset = ((commandApdu[2].toInt() and 0xFF) shl 8) or (commandApdu[3].toInt() and 0xFF)
            val length = commandApdu[4].toInt() and 0xFF
            
            val ndefMessage = createNdefMessage(urlToShare)
            val nlen = byteArrayOf((ndefMessage.size shr 8).toByte(), (ndefMessage.size and 0xFF).toByte())
            val fullNdef = nlen + ndefMessage

            if (offset >= fullNdef.size) return RESP_FAIL
            val readLength = Math.min(length, fullNdef.size - offset)
            val response = ByteArray(readLength)
            System.arraycopy(fullNdef, offset, response, 0, readLength)
            return response + RESP_OK
        }

        // Any another request (from Apple Wallet) gets refusal
        return RESP_FAIL
    }

    private fun createNdefMessage(url: String): ByteArray {
        val urlBytes = url.toByteArray(Charsets.UTF_8)
        val payload = ByteArray(urlBytes.size + 1)
        payload[0] = 0x00
        System.arraycopy(urlBytes, 0, payload, 1, urlBytes.size)

        val record = ByteArray(payload.size + 4)
        record[0] = 0xD1.toByte(); record[1] = 0x01.toByte(); record[2] = payload.size.toByte(); record[3] = 0x55.toByte()
        System.arraycopy(payload, 0, record, 4, payload.size)
        return record
    }

    override fun onDeactivated(reason: Int) { appSelected = false; ccSelected = false; ndefSelected = false }
}