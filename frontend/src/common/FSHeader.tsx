/* eslint @typescript-eslint/no-floating-promises: "off" */

import Button from '@material-ui/core/Button';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import LanguageIcon from '@material-ui/icons/Language';
import NotificationsIcon from '@material-ui/icons/Notifications';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import logo from '../assets/images/logo.svg';

interface LanguageType {
  name: string;
  value: string;
}

interface HeaderProps {
  changeLang: any;
}

const EN_LANGUAGE_LIST = ['en', 'en_US', 'en_GB'];
const ZH_LANGUAGE_LIST = ['zh', 'zh_CN'];

const LanguageList: LanguageType[] = [
  { name: 'ENGLISH', value: 'en' },
  { name: '简体中文', value: 'zh' },
];

const FSHeader: React.FC<HeaderProps> = ({ changeLang }) => {
  const { t, i18n } = useTranslation();

  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [curLanguage, setCurLanguage] = useState(LanguageList[0]);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const changeLanguage = (language: LanguageType) => {
    setCurLanguage(language);
    i18n.changeLanguage(language.value);
    changeLang(language.value);
    window.history.pushState({}, '', `/#/dashboard/${language.value}`);
    document.title = t('title');
    setAnchorEl(null);
  };

  useEffect(() => {
    if (EN_LANGUAGE_LIST.indexOf(i18n.language) >= 0) {
      i18n.language = 'en';
    }
    if (ZH_LANGUAGE_LIST.indexOf(i18n.language) >= 0) {
      i18n.language = 'zh';
    }
    changeLang(i18n.language);
    const matchLangList = LanguageList.filter((item) => item.value === i18n.language);
    if (matchLangList && matchLangList.length > 0) {
      setCurLanguage(matchLangList[0]);
    } else {
      setCurLanguage(LanguageList[0]);
    }
  }, [i18n.language]);

  return (
    <div className="fs-header">
      <div className="logo">
        <img className="img" width="30" alt="solutions" src={logo} />
        {t('title')}
      </div>
      <div className="user text-right">
        <div>
          <Button
            startIcon={<LanguageIcon />}
            className="csp-color-white"
            aria-controls="simple-menu"
            aria-haspopup="true"
            onClick={handleClick}
          >
            {curLanguage.name}
          </Button>
          <Menu id="simple-menu" anchorEl={anchorEl} keepMounted open={Boolean(anchorEl)}>
            {LanguageList.map((element, index) => {
              return (
                <MenuItem
                  key={index}
                  value={element.value}
                  className="csp-fontsize-14"
                  onClick={() => {
                    changeLanguage(element);
                  }}
                >
                  {element.name}
                </MenuItem>
              );
            })}
          </Menu>
        </div>
        <div className="csp-fontsize-14 csp-margin-top-7">
          <NotificationsIcon />
        </div>
        {/* <div>Admin User</div> */}
      </div>
    </div>
  );
};

export default FSHeader;
