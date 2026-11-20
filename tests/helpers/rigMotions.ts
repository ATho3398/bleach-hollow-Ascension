// 종이인형 테스트 준비 (C.509): 동작 데이터는 게임에선 따로 받는 덩어리(loadRigMotions)라, 종이인형을 재는 테스트는 맨 앞에서 이 파일을 import 해 채운다
import { installRigMotions } from '../../src/data/art/rig/pose';
import { RIG_MOTIONS_RAW } from '../../src/data/art/rig/motionsData';

installRigMotions(RIG_MOTIONS_RAW);
