# STEVAL-PROTEUS1 Full Capabilities & Feature Plan

## Sensor Suite (Verified on Hardware)

| Sensor | Interface | ODR | Role | Status |
|--------|-----------|-----|------|--------|
| ISM330DHCX | SPI1, CS=PA4 | 500Hz (configurable to 6.7kHz) | Primary 6-axis IMU | Working |
| IIS3DWB | SPI1 raw, CS=PA15 | 26.7kHz fixed | Impact vibration | Working |
| IIS2DLPC | I2C1, 0x18 | 1.6Hz-1.6kHz | Wake-on-motion | Initialized |
| STTS22H | I2C1, 0x3F | On-demand | Temperature compensation | Initialized |
| STSAFE-A110 | I2C1 | N/A | Crypto authentication | Not yet used |
| MX25R6435F | QuadSPI | N/A | 8MB offline storage | Code written, pins blocked |

## Key Novel Concepts

### Multi-Rate Sensor Fusion (Three-Tier)
- IIS2DLPC (0.4uA): Always-on wake detector — "subconscious"
- ISM330DHCX (500Hz): Full swing kinematics — "conscious tracking"
- IIS3DWB (26.7kHz): Impact micro-vibration — "touch sensitivity"

### ISM330DHCX Machine Learning Core (MLC)
- 8 decision tree flows, 256 results each, runs ON-SENSOR
- Can classify swing phases while MCU sleeps
- Finite State Machine (16 FSMs) for motion event detection

### IIS3DWB Impact Fingerprinting
- FFT of 50ms impact burst → strike quality classification
- Pure/Toe/Heel/Thin/Fat/Sky detection
- Club type auto-identification from vibration signature
- Surface detection (mat vs grass vs sand)

### STSAFE-A110 Data Provenance
- ECDSA-SHA256 signed swing records
- Tamper-proof hardware key (EAL5+)
- Verified practice logs, anti-counterfeiting
- Handicap data integrity

### Power Architecture
- Deep Sleep: <5uA (IIS2DLPC only)
- Idle: ~200uA (BLE advertising)
- Active: ~5mA (ISM330DHCX + IIS3DWB)
- Post-swing: ~10mA (BLE TX + flash write)

### Data Budget
- ~28KB per swing (ISM330DHCX raw + IIS3DWB burst + metadata)
- Flash capacity: ~290 swings offline
- BLE throughput: ~98KB/s (1M PHY), ~164KB/s (2M PHY)

## Implementation Phases
- Phase 1: Core capture + USB CSV (DONE)
- Phase 2: BLE streaming + impact analysis + flash storage
- Phase 3: MLC/FSM on-sensor classification + STSAFE signing
- Phase 4: Power optimization + always-on intelligence
- Phase 5: Multi-device mesh (802.15.4) + ecosystem
