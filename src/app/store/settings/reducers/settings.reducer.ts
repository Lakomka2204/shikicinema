import { createReducer, on } from '@ngrx/store';

import { SettingsStoreInterface } from '@app/store/settings/types/settings-store.interface';
import { defaultAvailableLangs } from '@app/core/transloco-root.module';
import {
    resetSettingsAction,
    updatePlayerPreferencesAction,
    updateSettingsAction,
} from '@app/store/settings/actions/settings.actions';

const initialState: SettingsStoreInterface = {
    language: '',
    availableLangs: defaultAvailableLangs,
    animePaginationSize: 100,
    authorPreferences: {},
    kindPreferences: {},
    domainPreferences: {},
};

const reducer = createReducer(
    initialState,
    on(
        updateSettingsAction,
        (state, { config }) => ({
            ...state,
            ...config,
        }),
    ),
    on(
        resetSettingsAction,
        () => ({ ...initialState }),
    ),
    on(
        updatePlayerPreferencesAction,
        (state, { animeId, author, kind, domain }) => ({
            ...state,
            authorPreferences: {
                ...state.authorPreferences,
                [animeId]: author,
            },
            kindPreferences: {
                ...state.kindPreferences,
                [animeId]: kind,
            },
            domainPreferences: {
                ...state.domainPreferences,
                [animeId]: domain,
            },
        }),
    ),
);

export function settingsReducer(state, action) {
    return reducer(state, action);
}