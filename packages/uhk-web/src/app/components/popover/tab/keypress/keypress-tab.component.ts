import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnChanges,
    Output,
    SimpleChanges
} from '@angular/core';
import { KeyAction, KeystrokeAction, KeystrokeType, SCANCODES, SecondaryRoleAction } from 'uhk-common';

import { Tab } from '../tab';
import { MapperService } from '../../../../services/mapper.service';
import { SelectOptionData } from '../../../../models/select-option-data';
import { KeyModifierModel } from '../../../../models/key-modifier-model';
import { mapLeftRightModifierToKeyActionModifier } from '../../../../util';
import { RemapInfo } from '../../../../models/remap-info';

@Component({
    selector: 'keypress-tab',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './keypress-tab.component.html',
    styleUrls: ['./keypress-tab.component.scss']
})
export class KeypressTabComponent extends Tab implements OnChanges {
    @Input() defaultKeyAction: KeyAction;
    @Input() secondaryRoleEnabled: boolean;
    @Input() allowRemapOnAllKeymapWarning: boolean;
    @Input() remapInfo: RemapInfo;
    @Input() showLayerSwitcherInSecondaryRoles: boolean;

    @Output() keyActionChange = new EventEmitter<KeystrokeAction>();

    leftModifiers: KeyModifierModel[];
    rightModifiers: KeyModifierModel[];

    scanCodeGroups: Array<SelectOptionData>;
    secondaryRoleGroups: Array<SelectOptionData> = [];

    selectedScancodeOption: SelectOptionData;
    selectedSecondaryRoleIndex: number;
    warningVisible: boolean;

    constructor(private mapper: MapperService,
                private cdRef: ChangeDetectorRef) {
        super();
        this.leftModifiers = mapper.getLeftKeyModifiers();
        this.rightModifiers = mapper.getRightKeyModifiers();

        this.scanCodeGroups = [{
            id: '0',
            text: 'None'
        }];
        this.scanCodeGroups = this.scanCodeGroups.concat(SCANCODES);
        this.selectedScancodeOption = this.scanCodeGroups[0];
        this.selectedSecondaryRoleIndex = -1;
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes.showLayerSwitcherInSecondaryRoles) {
            this.fillSecondaryRoles();
        }
        this.fromKeyAction(this.defaultKeyAction);
        this.keyActionChanged(false);
    }

    keyActionValid(keystrokeAction?: KeystrokeAction): boolean {
        if (!keystrokeAction) {
            keystrokeAction = this.toKeyAction();
        }

        return (keystrokeAction) ? (keystrokeAction.scancode > 0 || keystrokeAction.modifierMask > 0) : false;
    }

    onKeysCapture(event: { code: number, left: KeyModifierModel[], right: KeyModifierModel[] }) {
        if (event.code) {
            this.selectedScancodeOption = this.findScancodeOptionByScancode(event.code, KeystrokeType.basic);
        } else {
            this.selectedScancodeOption = this.scanCodeGroups[0];
        }

        this.leftModifiers = event.left;
        this.rightModifiers = event.right;
        this.keyActionChanged();
    }

    fromKeyAction(keyAction: KeyAction): boolean {
        if (!(keyAction instanceof KeystrokeAction)) {
            return false;
        }
        const keystrokeAction: KeystrokeAction = <KeystrokeAction>keyAction;
        // Restore selectedScancodeOption
        this.selectedScancodeOption = this.findScancodeOptionByScancode(keystrokeAction.scancode || 0, keystrokeAction.type);

        for (const modifier of this.leftModifiers) {
            modifier.checked = (keystrokeAction.modifierMask & modifier.value) > 0;
        }

        for (const modifier of this.rightModifiers) {
            modifier.checked = (keystrokeAction.modifierMask & modifier.value) > 0;
        }

        // Restore secondaryRoleAction
        if (keystrokeAction.secondaryRoleAction !== undefined) {
            this.selectedSecondaryRoleIndex = keystrokeAction.secondaryRoleAction;
        } else {
            this.selectedSecondaryRoleIndex = -1;
        }

        return true;
    }

    toKeyAction(): KeystrokeAction {
        const keystrokeAction: KeystrokeAction = new KeystrokeAction();
        const scTypePair = this.toScancodeTypePair(this.selectedScancodeOption);
        keystrokeAction.scancode = scTypePair[0];
        if (scTypePair[1] === 'media') {
            keystrokeAction.type = keystrokeAction.scancode > 255 ? KeystrokeType.longMedia : KeystrokeType.shortMedia;
        } else {
            keystrokeAction.type = KeystrokeType[scTypePair[1]];
        }
        keystrokeAction.modifierMask = mapLeftRightModifierToKeyActionModifier(this.leftModifiers, this.rightModifiers);

        keystrokeAction.secondaryRoleAction = this.selectedSecondaryRoleIndex === -1
            ? undefined
            : this.selectedSecondaryRoleIndex;

        if (this.keyActionValid(keystrokeAction)) {
            return keystrokeAction;
        }
    }

    toggleModifier(modifier: KeyModifierModel): void {
        modifier.checked = !modifier.checked;
        this.keyActionChanged();
    }

    onSecondaryRoleChange(id: string) {
        this.selectedSecondaryRoleIndex = +id;
        this.keyActionChanged();
    }

    onScancodeChange(id: string) {
        this.selectedScancodeOption = this.findScancodeOptionById(id);

        this.keyActionChanged();
    }

    modifiersTrackBy(index: number, modifier: KeyModifierModel): string {
        return `${modifier.value}${modifier.checked}`;
    }

    remapInfoChanged(remapInfo: RemapInfo): void {
        this.remapInfo = remapInfo;
        const keystrokeAction = this.toKeyAction();
        this.calculateRemapOnAllLayerWarningVisibility(keystrokeAction);
        this.cdRef.markForCheck();
    }

    private findScancodeOptionBy(predicate: (option: SelectOptionData) => boolean): SelectOptionData {
        let selectedOption: SelectOptionData;

        const scanCodeGroups: SelectOptionData[] = [...this.scanCodeGroups];
        while (scanCodeGroups.length > 0) {
            const scanCodeGroup = scanCodeGroups.shift();
            if (predicate(scanCodeGroup)) {
                selectedOption = scanCodeGroup;
                break;
            }

            if (scanCodeGroup.children) {
                scanCodeGroups.push(...scanCodeGroup.children);
            }
        }
        return selectedOption;
    }

    private findScancodeOptionById(id: string): SelectOptionData {
        return this.findScancodeOptionBy(option => option.id === id);
    }

    private findScancodeOptionByScancode(scancode: number, type: KeystrokeType): SelectOptionData {
        const typeToFind: string =
            (type === KeystrokeType.shortMedia || type === KeystrokeType.longMedia) ? 'media' : KeystrokeType[type];
        return this.findScancodeOptionBy((option: SelectOptionData) => {
            const additional = option.additional;
            if (additional && additional.scancode === scancode && additional.type === typeToFind) {
                return true;
            } else if ((!additional || additional.scancode === undefined) && +option.id === scancode) {
                return true;
            } else {
                return false;
            }
        });
    }

    private toScancodeTypePair(option: SelectOptionData): [number, string] {
        if (!option) {
            return [0, 'basic'];
        }

        let scanCode: number;
        let type: string;
        if (option.additional) {
            scanCode = option.additional.scancode;
            type = option.additional.type || 'basic';
        } else {
            type = 'basic';
        }
        if (scanCode === undefined) {
            scanCode = +option.id;
        }

        return [scanCode, type];
    }

    private keyActionChanged(dispatch = true): void {
        const keystrokeAction = this.toKeyAction();
        this.validAction.emit(this.keyActionValid(keystrokeAction));
        this.calculateRemapOnAllLayerWarningVisibility(keystrokeAction);

        if (dispatch) {
            this.keyActionChange.emit(keystrokeAction);
        }
    }

    private calculateRemapOnAllLayerWarningVisibility(keystrokeAction: KeystrokeAction): void {
        this.warningVisible = this.allowRemapOnAllKeymapWarning &&
            this.remapInfo &&
            !this.remapInfo.remapOnAllLayer &&
            keystrokeAction &&
            !keystrokeAction.hasScancode() &&
            keystrokeAction.hasOnlyOneActiveModifier();
    }

    private fillSecondaryRoles(): void {
        this.secondaryRoleGroups = [
            {
                id: '-1',
                text: 'None'
            }
        ];

        if (this.showLayerSwitcherInSecondaryRoles) {
            this.secondaryRoleGroups.push({
                text: 'Layer switcher',
                children: [
                    this.getSecondaryRoleDropdownItem(SecondaryRoleAction.mod),
                    this.getSecondaryRoleDropdownItem(SecondaryRoleAction.fn),
                    this.getSecondaryRoleDropdownItem(SecondaryRoleAction.mouse)
                ]
            });
        }

        this.secondaryRoleGroups.push({
            text: 'Modifier',
            children: [
                this.getSecondaryRoleDropdownItem(SecondaryRoleAction.leftShift),
                this.getSecondaryRoleDropdownItem(SecondaryRoleAction.leftCtrl),
                this.getSecondaryRoleDropdownItem(SecondaryRoleAction.leftSuper),
                this.getSecondaryRoleDropdownItem(SecondaryRoleAction.leftAlt),
                this.getSecondaryRoleDropdownItem(SecondaryRoleAction.rightShift),
                this.getSecondaryRoleDropdownItem(SecondaryRoleAction.rightCtrl),
                this.getSecondaryRoleDropdownItem(SecondaryRoleAction.rightSuper),
                this.getSecondaryRoleDropdownItem(SecondaryRoleAction.rightAlt)
            ]
        });
    }

    private getSecondaryRoleDropdownItem(action: SecondaryRoleAction): SelectOptionData {
        return {
            id: `${action}`,
            text: this.mapper.getSecondaryRoleText(action)
        };
    }
}
