import { useContext } from 'react'
import { GpsPositionContext, type GpsPositionState } from './GpsPositionProvider'

export function useGpsPosition(): GpsPositionState {
  return useContext(GpsPositionContext)
}
